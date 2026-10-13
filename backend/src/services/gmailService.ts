import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { google } from 'googleapis';
import { EmailModel } from '../models/Email';
import { RuleEngine } from './ruleEngine';
import { GroqService } from './groqService';
import { CategoryModel } from '../models/Category';
import { ParserService } from './parserService';
import { SyncStateModel } from '../models/SyncState';
import { notificationService } from './notificationService';
import { assertIngestionConfigured, runtimeConfig } from '../config/runtimeConfig';

export interface IngestionResult {
  totalProcessed: number;
  newIngested: number;
  duplicatesSkipped: number;
  needsReviewCount: number;
  notificationOnlyCount: number;
}

interface IncomingMail {
  messageId: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: Date;
  attachments?: Array<{ contentType: string; content: Buffer }>;
}

interface CandidateMail {
  seq: number;
  uid: number;
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
}

export class GmailService {
  public static async processIngestionPipeline(): Promise<IngestionResult> {
    assertIngestionConfigured();

    const syncState = await SyncStateModel.findOneAndUpdate(
      { key: 'gmail' },
      { lastAttemptedSyncAt: new Date(), $unset: { lastError: '' } },
      { upsert: true, new: true }
    );

    try {
      const result = runtimeConfig.gmail.user && runtimeConfig.gmail.appPassword
        ? await this.processImapIngestion(syncState.lastSuccessfulSyncAt)
        : await this.processOAuth2Ingestion(syncState.lastSuccessfulSyncAt);

      await SyncStateModel.updateOne(
        { key: 'gmail' },
        { lastSuccessfulSyncAt: new Date(), lastAttemptedSyncAt: new Date(), $unset: { lastError: '' } }
      );

      await notificationService.addNotification(
        'Gmail sync complete',
        `${result.newIngested} expenses added, ${result.notificationOnlyCount} selected-sender emails flagged for manual check.`,
        'SYNC',
        result
      );

      return result;
    } catch (error: any) {
      await SyncStateModel.updateOne(
        { key: 'gmail' },
        { lastAttemptedSyncAt: new Date(), lastError: error.message || String(error) },
        { upsert: true }
      );
      throw error;
    }
  }

  private static async processImapIngestion(lastSuccessfulSyncAt?: Date): Promise<IngestionResult> {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: runtimeConfig.gmail.user,
        pass: runtimeConfig.gmail.appPassword
      },
      logger: false
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mailboxMessageCount = client.mailbox ? client.mailbox.exists : 0;
        const startSeq = Math.max(1, mailboxMessageCount - runtimeConfig.gmailImapScanLimit + 1);
        const fetchRange = mailboxMessageCount > 0 ? `${startSeq}:*` : '1:*';
        const candidates: CandidateMail[] = [];

        for await (const message of client.fetch(fetchRange, { envelope: true })) {
          const sender = message.envelope?.from?.[0]?.address || message.envelope?.sender?.[0]?.address || '';
          const receivedAt = this.toDate(message.envelope?.date) || new Date();
          if (lastSuccessfulSyncAt && receivedAt <= lastSuccessfulSyncAt) continue;
          if (!sender || !this.isSelectedSender(sender)) continue;

          candidates.push({
            seq: message.seq,
            uid: message.uid,
            messageId: message.envelope?.messageId || `imap_msg_${message.uid}`,
            sender,
            subject: message.envelope?.subject || 'No Subject',
            receivedAt
          });
        }

        const mails: IncomingMail[] = [];
        for (const candidate of candidates.slice(-runtimeConfig.gmailIngestLimit)) {
          const sourceMessage = await client.fetchOne(candidate.seq, { source: true });
          if (!sourceMessage || !sourceMessage.source) continue;

          const parsed: ParsedMail = await simpleParser(sourceMessage.source);
          mails.push({
            messageId: parsed.messageId || candidate.messageId,
            sender: parsed.from?.value[0]?.address || candidate.sender,
            subject: parsed.subject || candidate.subject,
            body: (parsed.text || parsed.html || parsed.subject || candidate.subject || '') as string,
            receivedAt: parsed.date || candidate.receivedAt,
            attachments: parsed.attachments?.map((attachment) => ({
              contentType: attachment.contentType,
              content: attachment.content
            }))
          });
        }

        return this.processIncomingMails(mails);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private static async processOAuth2Ingestion(lastSuccessfulSyncAt?: Date): Promise<IngestionResult> {
    const oauth2Client = new google.auth.OAuth2(
      runtimeConfig.gmail.clientId,
      runtimeConfig.gmail.clientSecret,
      runtimeConfig.gmail.redirectUri
    );
    oauth2Client.setCredentials({ refresh_token: runtimeConfig.gmail.refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const senderFilter = runtimeConfig.targetSenderEmails.map((sender) => `from:${sender}`).join(' OR ');
    const afterFilter = lastSuccessfulSyncAt
      ? ` after:${lastSuccessfulSyncAt.getFullYear()}/${lastSuccessfulSyncAt.getMonth() + 1}/${lastSuccessfulSyncAt.getDate()}`
      : '';

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `(${senderFilter})${afterFilter}`,
      maxResults: 50
    });

    const messages = response.data.messages || [];
    const mails: IncomingMail[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const msgDetail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = msgDetail.data.payload?.headers || [];
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date')?.value;
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
      if (lastSuccessfulSyncAt && receivedAt <= lastSuccessfulSyncAt) continue;

      mails.push({
        messageId: headers.find((h) => h.name?.toLowerCase() === 'message-id')?.value || msg.id,
        sender: headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'unknown@domain.com',
        subject: headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject',
        body: msgDetail.data.snippet || '',
        receivedAt
      });
    }

    return this.processIncomingMails(mails);
  }

  private static async processIncomingMails(mails: IncomingMail[]): Promise<IngestionResult> {
    let totalProcessed = 0;
    let newIngested = 0;
    let duplicatesSkipped = 0;
    let needsReviewCount = 0;
    let notificationOnlyCount = 0;

    for (const mail of mails) {
      if (!this.isSelectedSender(mail.sender)) continue;
      totalProcessed++;

      const existing = await EmailModel.findOne({ messageId: mail.messageId });
      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      let { cleanText, structuredJson } = await ParserService.parseEmailBody(mail.body || mail.subject);
      let ocrText = '';
      for (const attachment of mail.attachments || []) {
        if (attachment.contentType.startsWith('image/')) {
          ocrText += await ParserService.processAttachmentImage(attachment.content);
        }
      }

      if (ocrText) {
        const reparsed = await ParserService.parseEmailBody(`${cleanText} ${ocrText}`);
        cleanText = reparsed.cleanText;
        structuredJson = { ...structuredJson, ...reparsed.structuredJson };
      }

      const result = await this.classifyAndStoreEmail({
        messageId: mail.messageId,
        sender: mail.sender,
        subject: mail.subject,
        rawTextBody: cleanText,
        parsedJson: structuredJson,
        ocrExtractedText: ocrText || undefined,
        receivedAt: mail.receivedAt
      });

      if (result.notificationOnly) {
        notificationOnlyCount++;
      } else {
        if (result.needsUserReview) needsReviewCount++;
        newIngested++;
      }
    }

    return { totalProcessed, newIngested, duplicatesSkipped, needsReviewCount, notificationOnlyCount };
  }

  private static isSelectedSender(sender: string): boolean {
    return runtimeConfig.targetSenderEmails.some((selectedSender) =>
      sender.toLowerCase().includes(selectedSender.toLowerCase())
    );
  }

  private static toDate(value: Date | string | undefined): Date | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private static async classifyAndStoreEmail(emailData: {
    messageId: string;
    sender: string;
    subject: string;
    rawTextBody: string;
    parsedJson: Record<string, any>;
    ocrExtractedText?: string;
    receivedAt: Date;
  }): Promise<{ needsUserReview: boolean; notificationOnly: boolean }> {
    if (!emailData.parsedJson.detectedAmount) {
      const aiFields = await GroqService.extractFinancialFields(
        emailData.sender,
        emailData.subject,
        emailData.rawTextBody
      );

      if (aiFields?.detectedAmount) {
        emailData.parsedJson = { ...emailData.parsedJson, ...aiFields };
      } else {
        await notificationService.addNotification(
          'Selected sender email needs manual check',
          `"${emailData.subject}" from ${emailData.sender} did not contain a detectable amount. Add it manually if it is an expense.`,
          'REVIEW',
          {
            messageId: emailData.messageId,
            sender: emailData.sender,
            subject: emailData.subject,
            receivedAt: emailData.receivedAt
          }
        );
        return { needsUserReview: false, notificationOnly: true };
      }
    }

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

    await EmailModel.create({
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

    return { needsUserReview: needsReview, notificationOnly: false };
  }
}
