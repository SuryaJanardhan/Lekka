import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { google } from 'googleapis';
import { EmailModel } from '../models/Email';
import { RuleEngine } from './ruleEngine';
import { GroqService } from './groqService';
import { CategoryModel } from '../models/Category';
import { ParserService } from './parserService';

export interface IngestionResult {
  totalProcessed: number;
  newIngested: number;
  duplicatesSkipped: number;
  needsReviewCount: number;
}

export class GmailService {
  public static async processIngestionPipeline(): Promise<IngestionResult> {
    const imapUser = process.env.GMAIL_USER;
    const imapPass = process.env.GMAIL_APP_PASSWORD;

    // 1. Direct Gmail App Password IMAP Ingestion Path
    if (imapUser && imapPass && imapPass !== 'your_16_character_app_password' && imapPass !== 'mock_app_password') {
      console.log(`[GmailService] Connecting via IMAP for ${imapUser}...`);
      return this.processImapIngestion(imapUser, imapPass);
    }

    // 2. OAuth2 Ingestion Path
    const oauth2Client = this.getOAuth2Client();
    if (oauth2Client) {
      console.log('[GmailService] Connecting via Google OAuth2 API...');
      return this.processOAuth2Ingestion(oauth2Client);
    }

    // 3. Mock Batch Fallback
    console.log('[GmailService] No live credentials found. Executing mock ingestion batch...');
    return this.executeMockIngestionBatch();
  }

  private static async processImapIngestion(user: string, pass: string): Promise<IngestionResult> {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false
    });

    let totalProcessed = 0;
    let newIngested = 0;
    let duplicatesSkipped = 0;
    let needsReviewCount = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const targetSenders = (process.env.TARGET_SENDER_EMAILS || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        for await (const message of client.fetch('1:*', { envelope: true, source: true })) {
          if (!message.source) continue;
          totalProcessed++;

          const parsed: ParsedMail = await simpleParser(message.source);
          const messageIdHeader = parsed.messageId || `imap_msg_${message.uid}`;
          const sender = parsed.from?.value[0]?.address || 'unknown@domain.com';
          const subject = parsed.subject || 'No Subject';
          const receivedAt = parsed.date || new Date();

          // Filter by target senders if configured
          if (targetSenders.length > 0) {
            const senderMatch = targetSenders.some((ts) => sender.toLowerCase().includes(ts.toLowerCase()));
            if (!senderMatch) continue;
          }

          // Check deduplication index in MongoDB
          const existing = await EmailModel.findOne({ messageId: messageIdHeader });
          if (existing) {
            duplicatesSkipped++;
            continue;
          }

          // Body & Attachment text extraction
          const bodyContent = parsed.text || parsed.html || subject;
          const { cleanText, structuredJson } = await ParserService.parseEmailBody(bodyContent as string);

          let ocrText = '';
          if (parsed.attachments && parsed.attachments.length > 0) {
            for (const att of parsed.attachments) {
              if (att.contentType.startsWith('image/')) {
                ocrText += await ParserService.processAttachmentImage(att.content);
              }
            }
          }

          const res = await this.classifyAndStoreEmail({
            messageId: messageIdHeader,
            sender,
            subject,
            rawTextBody: cleanText,
            parsedJson: structuredJson,
            ocrExtractedText: ocrText || undefined,
            receivedAt
          });

          if (res.needsUserReview) needsReviewCount++;
          newIngested++;
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (error) {
      console.error('[GmailService] IMAP error:', error);
    }

    return { totalProcessed, newIngested, duplicatesSkipped, needsReviewCount };
  }

  private static getOAuth2Client() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground';
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || clientId === 'mock_client_id' || !refreshToken || refreshToken === 'mock_refresh_token') {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  private static async processOAuth2Ingestion(oauth2Client: any): Promise<IngestionResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const targetSenders = (process.env.TARGET_SENDER_EMAILS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const queryFilter = targetSenders.length > 0
        ? targetSenders.map((sender) => `from:${sender}`).join(' OR ')
        : 'is:unread';

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: queryFilter,
        maxResults: 20
      });

      const messages = response.data.messages || [];
      let newIngested = 0;
      let duplicatesSkipped = 0;
      let needsReviewCount = 0;

      for (const msg of messages) {
        if (!msg.id) continue;

        const msgDetail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const headers = msgDetail.data.payload?.headers || [];

        const messageIdHeader = headers.find((h) => h.name?.toLowerCase() === 'message-id')?.value || msg.id;
        const sender = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'unknown@domain.com';
        const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
        const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date')?.value;
        const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

        const existing = await EmailModel.findOne({ messageId: messageIdHeader });
        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        const bodyData = msgDetail.data.snippet || subject;
        const { cleanText, structuredJson } = await ParserService.parseEmailBody(bodyData);

        const result = await this.classifyAndStoreEmail({
          messageId: messageIdHeader,
          sender,
          subject,
          rawTextBody: cleanText,
          parsedJson: structuredJson,
          receivedAt
        });

        if (result.needsUserReview) needsReviewCount++;
        newIngested++;
      }

      return { totalProcessed: messages.length, newIngested, duplicatesSkipped, needsReviewCount };
    } catch (error) {
      console.error('[GmailService] OAuth2 Ingestion error:', error);
      return this.executeMockIngestionBatch();
    }
  }

  private static async executeMockIngestionBatch(): Promise<IngestionResult> {
    const mockEmails = [
      {
        messageId: `msg_mock_inv_${Date.now()}_1`,
        sender: 'billing@aws.amazon.com',
        subject: 'Your AWS Monthly Service Invoice #INV-98231',
        body: 'Total Amount Due: $142.50 USD for AWS Cloud Infrastructure services. Reference ID: INV-98231. Date: 2026-09-20.',
        date: new Date()
      },
      {
        messageId: `msg_mock_alert_${Date.now()}_2`,
        sender: 'security@github.com',
        subject: 'Security Alert: New SSH key added to your account',
        body: 'A new SSH key was added to account username surya from IP address 192.168.1.1. If this was not you, revoke it immediately.',
        date: new Date()
      }
    ];

    let newIngested = 0;
    let duplicatesSkipped = 0;
    let needsReviewCount = 0;

    for (const mock of mockEmails) {
      const existing = await EmailModel.findOne({ messageId: mock.messageId });
      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      const { cleanText, structuredJson } = await ParserService.parseEmailBody(mock.body);
      const res = await this.classifyAndStoreEmail({
        messageId: mock.messageId,
        sender: mock.sender,
        subject: mock.subject,
        rawTextBody: cleanText,
        parsedJson: structuredJson,
        receivedAt: mock.date
      });

      if (res.needsUserReview) needsReviewCount++;
      newIngested++;
    }

    return { totalProcessed: mockEmails.length, newIngested, duplicatesSkipped, needsReviewCount };
  }

  private static async classifyAndStoreEmail(emailData: {
    messageId: string;
    sender: string;
    subject: string;
    rawTextBody: string;
    parsedJson: Record<string, any>;
    ocrExtractedText?: string;
    receivedAt: Date;
  }) {
    let categoryId = await RuleEngine.evaluateEmail(emailData.sender, emailData.subject, emailData.rawTextBody);
    let categorySource: 'RULE' | 'GROQ_AI' | 'USER_MANUAL' | 'UNASSIGNED' = 'RULE';
    let needsReview = false;
    let confidenceScore = 1.0;

    if (!categoryId) {
      const aiResult = await GroqService.classifyEmailContent(emailData.sender, emailData.subject, emailData.rawTextBody);
      categorySource = 'GROQ_AI';
      confidenceScore = aiResult.confidenceScore;

      let category = await CategoryModel.findOne({ name: aiResult.categoryName });
      if (!category) {
        category = new CategoryModel({
          name: aiResult.categoryName,
          slug: aiResult.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          createdSource: 'SYSTEM'
        });
        await category.save();
      }
      categoryId = category._id as any;

      if (aiResult.confidenceScore < 0.8) {
        needsReview = true;
      }
    }

    const emailDoc = new EmailModel({
      messageId: emailData.messageId,
      sender: emailData.sender,
      subject: emailData.subject,
      rawTextBody: emailData.rawTextBody,
      parsedJson: emailData.parsedJson,
      ocrExtractedText: emailData.ocrExtractedText,
      categoryId,
      categorySource,
      aiConfidenceScore: confidenceScore,
      needsUserReview: needsReview,
      reviewStatus: needsReview ? 'PENDING' : 'APPROVED',
      receivedAt: emailData.receivedAt
    });

    await emailDoc.save();
    return { emailDoc, needsUserReview: needsReview };
  }
}
