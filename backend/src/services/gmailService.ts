import { createHash, randomUUID } from 'crypto';
import { simpleParser } from 'mailparser';
import { google } from 'googleapis';
import { EmailModel } from '../models/Email';
import { RuleEngine } from './ruleEngine';
import { GroqService } from './groqService';
import { CategoryModel } from '../models/Category';
import { ParserService } from './parserService';
import { ISyncState, SyncStateModel } from '../models/SyncState';
import { notificationService } from './notificationService';
import { assertIngestionConfigured, runtimeConfig } from '../config/runtimeConfig';
import { NotificationModel } from '../models/Notification';
import { ProcessedMailModel } from '../models/ProcessedMail';
import { admitMail, exactSenderMatch } from './mailAdmission';
import { InboxCursor, InboxMail, InboxSettings, scanImapInbox } from './imapInbox';
import { transactionDirection } from './expensePolicy';
import { learningConditions } from './categoryLearning';

export interface IngestionResult {
  totalProcessed: number;
  newIngested: number;
  duplicatesSkipped: number;
  needsReviewCount: number;
  notificationOnlyCount: number;
  creditsSkipped?: number;
  skipped?: string;
  diagnostics?: Record<string, unknown>;
  processedEmails?: Array<{ messageId: string; sender: string; subject: string; receivedAt: Date; result: string; isTest: boolean }>;
}

type IncomingMail = InboxMail;

export class GmailService {
  private static inboxSettings(): InboxSettings {
    return {
      user: runtimeConfig.gmail.user, password: runtimeConfig.gmail.appPassword,
      selectedSenders: runtimeConfig.targetSenderEmails,
      trustedForwarders: runtimeConfig.trustedForwarderEmails,
      testRecipient: runtimeConfig.ingestionTestRecipient,
      scanLimit: runtimeConfig.gmailImapScanLimit, processLimit: runtimeConfig.gmailIngestLimit
    };
  }

  public static async previewIngestion() {
    assertIngestionConfigured();
    if (!runtimeConfig.gmail.user || !runtimeConfig.gmail.appPassword) {
      throw new Error('Read-only mailbox preview requires the configured Gmail app-password connection.');
    }
    const scan = await scanImapInbox(this.inboxSettings(), undefined, true);
    const matchedMessages = await Promise.all(scan.mails.map(async (mail) => {
      const parsed = await ParserService.parseEmailBody(mail.body);
      const [expense, review, processed] = await Promise.all([
        EmailModel.exists({ messageId: mail.messageId }),
        NotificationModel.exists({ type: 'REVIEW', 'metadata.messageId': mail.messageId }),
        ProcessedMailModel.exists({ messageId: mail.messageId })
      ]);
      return {
        messageId: mail.messageId, sender: mail.sender, transportSender: mail.transportSender,
        subject: mail.subject, receivedAt: mail.receivedAt, arrivedAt: mail.arrivedAt, isTest: mail.isTest,
        reason: mail.admissionReason, alreadyRecorded: Boolean(expense || review || processed),
        detectedAmount: parsed.structuredJson.detectedAmount || null
      };
    }));
    return { ...scan.diagnostics, readOnly: true, matchedMessages };
  }

  public static async processIngestionPipeline(source: 'manual' | 'automatic' = 'automatic'): Promise<IngestionResult> {
    const token = randomUUID();
    const startedAt = new Date();
    let syncState;
    try {
      syncState = await SyncStateModel.findOneAndUpdate({
        key: 'gmail', $or: [{ ingestionLockUntil: { $exists: false } }, { ingestionLockUntil: { $lt: startedAt } }]
      }, {
        $set: { lastAttemptedSyncAt: startedAt, ingestionLockToken: token, ingestionLockUntil: new Date(startedAt.getTime() + 5 * 60 * 1000) },
        $unset: { lastError: '' }
      }, { upsert: true, new: true });
    } catch (error: any) {
      if (error.code === 11000) return { totalProcessed: 0, newIngested: 0, duplicatesSkipped: 0, needsReviewCount: 0, notificationOnlyCount: 0, skipped: 'A Gmail ingestion is already running' };
      throw error;
    }
    if (!syncState) throw new Error('Gmail ingestion lock could not be acquired');
    try {
      assertIngestionConfigured();
      let result: IngestionResult;
      let nextCursor: InboxCursor | undefined;
      let nextOAuthCursor: ISyncState['oauthCursor'];
      if (runtimeConfig.gmail.user && runtimeConfig.gmail.appPassword) {
        const scan = await scanImapInbox(this.inboxSettings(), syncState.imapCursor);
        result = await this.processIncomingMails(scan.mails);
        result.diagnostics = scan.diagnostics;
        nextCursor = scan.cursor;
      } else {
        const page = await this.processOAuth2Ingestion(syncState.oauthCursor);
        result = page.result;
        nextOAuthCursor = page.cursor;
      }
      const saved = await SyncStateModel.updateOne(
        { key: 'gmail', ingestionLockToken: token },
        { $set: { lastSuccessfulSyncAt: new Date(), ...(nextCursor ? { imapCursor: nextCursor } : {}), ...(nextOAuthCursor ? { oauthCursor: nextOAuthCursor } : {}) }, $unset: { lastError: '' } }
      );
      if (!saved.matchedCount) throw new Error('Gmail ingestion lease expired before progress was committed');
      await notificationService.addNotification(
        'Gmail sync complete',
        result.newIngested + ' expenses added, ' + result.needsReviewCount + ' transactions need review, ' + result.notificationOnlyCount + ' emails need a manual amount check.',
        'SYNC', { ...result, source }
      );
      return result;
    } catch (error: any) {
      await SyncStateModel.updateOne(
        { key: 'gmail', ingestionLockToken: token }, { lastError: error.message || String(error) }
      ).catch(() => console.error('[Ingestion] Could not record the sync error'));
      if (source === 'automatic') {
        await notificationService.addNotification(
          'Gmail sync needs attention',
          'Automatic email sync could not finish. Open Settings to check sync status.',
          'SYNC', { source, status: 'failed' }
        ).catch(() => console.error('[Push] Could not record the automatic sync failure alert'));
      }
      throw error;
    } finally {
      await SyncStateModel.updateOne(
        { key: 'gmail', ingestionLockToken: token },
        { $unset: { ingestionLockToken: '', ingestionLockUntil: '' } }
      ).catch(() => console.error('[Ingestion] Could not release the sync lease'));
    }
  }

  private static async processOAuth2Ingestion(saved?: ISyncState['oauthCursor']) {
    const oauth2Client = new google.auth.OAuth2(
      runtimeConfig.gmail.clientId, runtimeConfig.gmail.clientSecret, runtimeConfig.gmail.redirectUri
    );
    oauth2Client.setCredentials({ refresh_token: runtimeConfig.gmail.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const settings = this.inboxSettings();
    const key = createHash('sha256').update(JSON.stringify({
      mailbox: profile.data.emailAddress, senders: settings.selectedSenders,
      forwarders: settings.trustedForwarders, testRecipient: settings.testRecipient
    })).digest('hex');
    const checkpoint = saved?.key === key ? saved : undefined;
    const after = checkpoint?.after || 0;
    const before = checkpoint?.before || Math.floor(Date.now() / 1000) + 1;
    const conditions = [...settings.selectedSenders, ...settings.trustedForwarders].map(sender => 'from:' + sender);
    if (settings.testRecipient) conditions.push('to:' + settings.testRecipient, 'deliveredto:' + settings.testRecipient);
    const query = '(' + conditions.join(' OR ') + ') before:' + before + (after ? ' after:' + Math.max(0, after - 1) : '');
    const response = await gmail.users.messages.list({
      userId: 'me', labelIds: ['INBOX'], q: query,
      maxResults: Math.min(500, runtimeConfig.gmailIngestLimit), pageToken: checkpoint?.pageToken
    });
    const mails: IncomingMail[] = [];
    let ignored = 0;
    for (const message of response.data.messages || []) {
      if (!message.id) continue;
      const detail = await gmail.users.messages.get({ userId: 'me', id: message.id, format: 'raw' });
      if (!detail.data.raw) continue;
      const outer = await simpleParser(Buffer.from(detail.data.raw, 'base64url'));
      const admission = await admitMail(outer, settings);
      if (!admission.accepted) { ignored++; continue; }
      const mail = admission.mail;
      const arrived = Number(detail.data.internalDate);
      const arrivedAt = Number.isFinite(arrived) && arrived > 0 ? new Date(arrived) : outer.date || new Date();
      mails.push({
        messageId: mail.messageId || outer.messageId || message.id,
        sender: admission.sender, transportSender: admission.transportSender,
        subject: mail.subject || outer.subject || 'No Subject',
        body: mail.text || (typeof mail.html === 'string' ? mail.html : '') || mail.subject || '',
        receivedAt: mail.date || arrivedAt, arrivedAt,
        isTest: admission.isTest, admissionReason: admission.reason,
        attachments: mail.attachments.map(attachment => ({ contentType: attachment.contentType, content: attachment.content }))
      });
    }
    const result = await this.processIncomingMails(mails);
    result.diagnostics = { mailbox: profile.data.emailAddress, folder: 'INBOX', ignored, hasMore: Boolean(response.data.nextPageToken) };
    const cursor: NonNullable<ISyncState['oauthCursor']> = response.data.nextPageToken
      ? { key, after, before, pageToken: response.data.nextPageToken }
      : { key, after: before };
    return { result, cursor };
  }

  private static async processIncomingMails(mails: IncomingMail[]): Promise<IngestionResult> {
    let totalProcessed = 0;
    let newIngested = 0;
    let duplicatesSkipped = 0;
    let needsReviewCount = 0;
    let notificationOnlyCount = 0;
    let creditsSkipped = 0;
    const processedEmails: NonNullable<IngestionResult['processedEmails']> = [];

    for (const mail of mails) {
      if (!this.isSelectedSender(mail.sender) && !mail.isTest) continue;
      totalProcessed++;

      const [existing, reviewed, processed] = await Promise.all([
        EmailModel.exists({ messageId: mail.messageId }),
        NotificationModel.exists({ type: 'REVIEW', 'metadata.messageId': mail.messageId }),
        ProcessedMailModel.exists({ messageId: mail.messageId })
      ]);
      if (existing || reviewed || processed) {
        if (!processed) await ProcessedMailModel.updateOne({ messageId: mail.messageId }, {
          $setOnInsert: { messageId: mail.messageId, outcome: existing ? 'EXPENSE' : 'REVIEW', isTest: mail.isTest }
        }, { upsert: true });
        duplicatesSkipped++;
        processedEmails.push({ messageId: mail.messageId, sender: mail.sender, subject: mail.subject, receivedAt: mail.receivedAt, result: 'already_recorded', isTest: mail.isTest });
        continue;
      }

      let { cleanText, structuredJson } = await ParserService.parseEmailBody(mail.body || mail.subject);
      structuredJson.ingestionTest = mail.isTest;
      structuredJson.transportSender = mail.transportSender;
      structuredJson.mailArrivedAt = mail.arrivedAt.toISOString();
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
        receivedAt: mail.receivedAt,
        isTest: mail.isTest,
        transportSender: mail.transportSender
      });

      await ProcessedMailModel.updateOne({ messageId: mail.messageId }, {
        $setOnInsert: { messageId: mail.messageId, outcome: result.ignoredCredit ? 'IGNORED_CREDIT' : result.notificationOnly ? 'REVIEW' : 'EXPENSE', isTest: mail.isTest }
      }, { upsert: true });

      if (result.ignoredCredit) {
        creditsSkipped++;
      } else if (result.notificationOnly) {
        notificationOnlyCount++;
      } else {
        if (result.needsUserReview) needsReviewCount++;
        newIngested++;
      }
      processedEmails.push({ messageId: mail.messageId, sender: mail.sender, subject: mail.subject, receivedAt: mail.receivedAt, result: result.ignoredCredit ? 'ignored_credit' : result.notificationOnly ? 'review_notification' : 'expense_saved', isTest: mail.isTest });
    }

    return { totalProcessed, newIngested, duplicatesSkipped, needsReviewCount, notificationOnlyCount, creditsSkipped, processedEmails };
  }

  private static isSelectedSender(sender: string): boolean {
    return exactSenderMatch(sender, runtimeConfig.targetSenderEmails);
  }

  private static async classifyAndStoreEmail(emailData: {
    messageId: string;
    sender: string;
    subject: string;
    rawTextBody: string;
    parsedJson: Record<string, any>;
    ocrExtractedText?: string;
    receivedAt: Date;
    isTest: boolean;
    transportSender: string;
  }): Promise<{ needsUserReview: boolean; notificationOnly: boolean; ignoredCredit?: boolean }> {
    let direction = transactionDirection(emailData.subject, emailData.rawTextBody);
    if (direction === 'CREDIT') return { needsUserReview: false, notificationOnly: false, ignoredCredit: true };
    if (direction === 'UNKNOWN' || !emailData.parsedJson.detectedAmount) {
      const aiFields = await GroqService.extractFinancialFields(
        emailData.sender,
        emailData.subject,
        emailData.rawTextBody
      );

      if (aiFields?.transactionDirection === 'CREDIT') return { needsUserReview: false, notificationOnly: false, ignoredCredit: true };
      if (aiFields?.transactionDirection === 'DEBIT' && aiFields?.detectedAmount) {
        emailData.parsedJson = { ...emailData.parsedJson, ...aiFields };
        direction = 'DEBIT';
      } else {
        await notificationService.addNotification(
          `${emailData.parsedJson.detectedAmount ? 'Expense unclear' : 'Amount missing'}: ${emailData.sender}`,
          `"${emailData.subject}" from ${emailData.sender} could not be confirmed as a completed debit with an amount. Review and add it manually only if it is an expense.`,
          'REVIEW',
          {
            messageId: emailData.messageId,
            sender: emailData.sender,
            subject: emailData.subject,
            receivedAt: emailData.receivedAt,
            ingestionTest: emailData.isTest,
            transportSender: emailData.transportSender
          }
        );
        return { needsUserReview: false, notificationOnly: true };
      }
    }
    emailData.parsedJson.transactionDirection = direction;

    let categoryId = await RuleEngine.evaluateEmail(emailData.sender, emailData.subject, emailData.rawTextBody);
    emailData.parsedJson.ingestionTest = emailData.isTest;
    emailData.parsedJson.transportSender = emailData.transportSender;
    let categorySource: 'RULE' | 'GROQ_AI' | 'USER_MANUAL' | 'UNASSIGNED' = 'RULE';
    let needsReview = false;
    let confidenceScore = 1.0;

    if (!categoryId) {
      const aiResult = await GroqService.classifyEmailContent(emailData.sender, emailData.subject, emailData.rawTextBody);
      if (aiResult.merchantName) emailData.parsedJson.merchantName = aiResult.merchantName;
      categorySource = 'GROQ_AI';
      confidenceScore = aiResult.confidenceScore;

      let category = await CategoryModel.findOne({ name: aiResult.categoryName });
      if (!category && !await CategoryModel.exists({})) {
        category = new CategoryModel({
          name: aiResult.categoryName,
          slug: aiResult.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          createdSource: 'SYSTEM'
        });
        await category.save();
      }
      categoryId = category ? category._id as any : null;

      if (!category || aiResult.confidenceScore < 0.8) {
        needsReview = true;
      }
      if (!category) categorySource = 'UNASSIGNED';
      const conditions = learningConditions(emailData.sender, emailData.subject, emailData.parsedJson.merchantName, emailData.rawTextBody);
      if (category && aiResult.confidenceScore >= 0.9 && conditions[1].field === 'body') {
        await RuleEngine.autoGenerateRuleFromUserFeedback(emailData.subject, emailData.sender, categoryId!,
          emailData.parsedJson.merchantName, emailData.rawTextBody, 'AI');
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
