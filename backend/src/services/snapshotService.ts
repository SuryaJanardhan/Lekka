import { CategoryModel } from '../models/Category';
import { EmailModel } from '../models/Email';
import { RuleModel } from '../models/Rule';
import { SyncStateModel } from '../models/SyncState';
import { LedgerReportService } from './ledgerReportService';
import { notificationService } from './notificationService';
import { dataRevision } from './dataRevisionService';

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
      const [categories, entries, analytics, rules, notifications] = await Promise.all([
        CategoryModel.find({}).sort({ name: 1 }).lean(),
        EmailModel.find(includeCredits ? {} : { 'parsedJson.transactionDirection': { $ne: 'CREDIT' } }).populate('categoryId').sort({ receivedAt: -1 }).lean(),
        LedgerReportService.getDashboardStats(snapshotMonth()),
        RuleModel.find({}).populate('categoryId').sort({ priority: -1 }).lean(),
        notificationService.getNotifications(includeCredits)
      ]);
      const status = await this.status();
      if (status.revision !== before.revision || status.ingestionInProgress) continue;
      return { ...status, generatedAt: new Date().toISOString(), categories, entries, analytics, rules, notifications };
    }
    throw new Error('Data changed during sync. Please retry.');
  }
}
