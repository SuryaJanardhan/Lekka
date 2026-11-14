import { CategoryModel } from '../models/Category';
import { EmailModel } from '../models/Email';
import { RuleModel } from '../models/Rule';
import { SyncStateModel } from '../models/SyncState';
import { LedgerReportService } from './ledgerReportService';
import { notificationService } from './notificationService';
import { dataRevision } from './dataRevisionService';
import { SyncDeletionModel } from '../models/SyncDeletion';

function compactEntry(entry: any) {
  const parsed = entry.parsedJson || {};
  return {
    _id: entry._id, messageId: entry.messageId, sender: entry.sender, subject: entry.subject,
    rawTextBody: String(entry.rawTextBody || '').replace(/\s+/g, ' ').trim().slice(0, 800),
    parsedJson: {
      detectedAmount: parsed.detectedAmount, transactionDirection: parsed.transactionDirection,
      currency: parsed.currency, merchantName: parsed.merchantName, paymentMode: parsed.paymentMode,
      friendName: parsed.friendName, notes: parsed.notes, notesSource: parsed.notesSource,
      isManual: parsed.isManual, detectedDate: parsed.detectedDate, referenceNumber: parsed.referenceNumber
    },
    hasAttachments: entry.hasAttachments, categoryId: entry.categoryId, categorySource: entry.categorySource,
    aiConfidenceScore: entry.aiConfidenceScore, needsUserReview: entry.needsUserReview,
    reviewStatus: entry.reviewStatus, receivedAt: entry.receivedAt, processedAt: entry.processedAt,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt
  };
}

export function snapshotMonth(now = new Date()) {
  const date = new Date(now.getTime() + 330 * 60000);
  return {
    startDate: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - 330 * 60000).toISOString(),
    endDate: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 330 * 60000).toISOString()
  };
}

export class SnapshotService {
  static async status() {
    const [revision, gmail] = await Promise.all([dataRevision(), SyncStateModel.findOne({ key: 'gmail' }).select('lastSuccessfulSyncAt ingestionLockUntil').lean()]);
    return { schemaVersion: 1, revision, lastSuccessfulIngestionAt: gmail?.lastSuccessfulSyncAt?.toISOString() || null,
      ingestionInProgress: Boolean(gmail?.ingestionLockUntil && gmail.ingestionLockUntil.getTime() > Date.now()) };
  }

  static async snapshot(includeCredits = false) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.status();
      if (before.ingestionInProgress) throw new Error('Ingestion is still running');
      const cutoff = new Date();
      const [categories, entries, analytics, rules, notifications] = await Promise.all([
        CategoryModel.find({}).sort({ name: 1 }).lean(),
        EmailModel.find({ ...(includeCredits ? {} : { 'parsedJson.transactionDirection': { $ne: 'CREDIT' } }), updatedAt: { $lte: cutoff } }).populate('categoryId').sort({ receivedAt: -1 }).lean(),
        LedgerReportService.getDashboardStats(snapshotMonth()),
        RuleModel.find({}).populate('categoryId').sort({ priority: -1 }).lean(),
        notificationService.getNotifications(includeCredits)
      ]);
      const status = await this.status();
      if (status.revision !== before.revision || status.ingestionInProgress) continue;
      return { ...status, generatedAt: cutoff.toISOString(), categories, entries: entries.map(compactEntry), analytics, rules, notifications };
    }
    throw new Error('Data changed during sync. Please retry.');
  }

  static async changes(afterValue: string, includeCredits = false) {
    const after = new Date(afterValue);
    if (Number.isNaN(after.getTime()) || after.getTime() > Date.now() + 60_000) throw new Error('Invalid sync cursor');
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.status();
      if (before.ingestionInProgress) throw new Error('Ingestion is still running');
      const cutoff = new Date();
      const [categories, entries, deletions, analytics, rules, notifications] = await Promise.all([
        CategoryModel.find({}).sort({ name: 1 }).lean(),
        EmailModel.find({ ...(includeCredits ? {} : { 'parsedJson.transactionDirection': { $ne: 'CREDIT' } }), updatedAt: { $gt: after, $lte: cutoff } }).populate('categoryId').sort({ receivedAt: -1 }).lean(),
        SyncDeletionModel.find({ kind: 'entry', deletedAt: { $gt: after, $lte: cutoff } }).lean(),
        LedgerReportService.getDashboardStats(snapshotMonth()),
        RuleModel.find({}).populate('categoryId').sort({ priority: -1 }).lean(),
        notificationService.getNotifications(includeCredits)
      ]);
      const status = await this.status();
      if (status.revision !== before.revision || status.ingestionInProgress) continue;
      const changedIds = new Set(entries.map(entry => String(entry._id)));
      return { ...status, generatedAt: cutoff.toISOString(), categories, entries: entries.map(compactEntry),
        deletedEntryIds: deletions.map(row => row.recordId).filter(id => !changedIds.has(id)), analytics, rules, notifications };
    }
    throw new Error('Data changed during sync. Please retry.');
  }
}
