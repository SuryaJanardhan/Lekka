import { google } from 'googleapis';
import { EmailModel } from '../models/Email.js';
import { RuleEngine } from './ruleEngine.js';
import { GroqService } from './groqService.js';
import { CategoryModel } from '../models/Category.js';
import { ParserService } from './parserService.js';

export interface IngestionResult {
  totalProcessed: number;
  newIngested: number;
  duplicatesSkipped: number;
  needsReviewCount: number;
}

export class GmailService {
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

  public static async processIngestionPipeline(): Promise<IngestionResult> {
    const oauth2Client = this.getOAuth2Client();

    if (!oauth2Client) {
      // Execute mock email ingestion batch for testing when real Gmail API tokens are unconfigured
      return this.executeMockIngestionBatch();
    }

    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Build target senders query filter
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

        // Check deduplication index in MongoDB
        const existing = await EmailModel.findOne({ messageId: messageIdHeader });
        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        // Body extraction
        const bodyData = msgDetail.data.snippet || subject;
        const { cleanText, structuredJson } = await ParserService.parseEmailBody(bodyData);

        // Process email classification
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

      return {
        totalProcessed: messages.length,
        newIngested,
        duplicatesSkipped,
        needsReviewCount
      };
    } catch (error) {
      console.error('Gmail Ingestion Error:', error);
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
      },
      {
        messageId: `msg_mock_order_${Date.now()}_3`,
        sender: 'orders@vendor.com',
        subject: 'Order Confirmation #ORD-44910',
        body: 'Thank you for your order #ORD-44910. Total Amount: $49.99. Estimated Delivery: Sep 24, 2026.',
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

    return {
      totalProcessed: mockEmails.length,
      newIngested,
      duplicatesSkipped,
      needsReviewCount
    };
  }

  private static async classifyAndStoreEmail(emailData: {
    messageId: string;
    sender: string;
    subject: string;
    rawTextBody: string;
    parsedJson: Record<string, any>;
    receivedAt: Date;
  }) {
    // 1. Rule Engine Evaluation
    let categoryId = await RuleEngine.evaluateEmail(emailData.sender, emailData.subject, emailData.rawTextBody);
    let categorySource: 'RULE' | 'GROQ_AI' | 'USER_MANUAL' | 'UNASSIGNED' = 'RULE';
    let needsReview = false;
    let confidenceScore = 1.0;

    if (!categoryId) {
      // 2. Groq AI Fallback Classification
      const aiResult = await GroqService.classifyEmailContent(emailData.sender, emailData.subject, emailData.rawTextBody);
      categorySource = 'GROQ_AI';
      confidenceScore = aiResult.confidenceScore;

      // Find or create category in DB
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
