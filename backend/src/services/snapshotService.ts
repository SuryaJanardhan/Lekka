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
    const [revision, gmail] = await Promise.all([dataRevision(), SyncStateModel.findOne({ key: 'gmail' }).select('lastSuccessfulSyncAt').lean()]);
    return { schemaVersion: 1, revision, lastSuccessfulIngestionAt: gmail?.lastSuccessfulSyncAt?.toISOString() || null };
  }

  static async snapshot() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await dataRevision();
      const [categories, entries, analytics, rules, notifications, status] = await Promise.all([
        CategoryModel.find({}).sort({ name: 1 }).lean(),
        EmailModel.find({}).populate('categoryId').sort({ receivedAt: -1 }).lean(),
        LedgerReportService.getDashboardStats(snapshotMonth()),
        RuleModel.find({}).populate('categoryId').sort({ priority: -1 }).lean(),
        notificationService.getNotifications(),
        this.status()
      ]);
      const revision = await dataRevision();
      if (revision !== before) continue;
      return { ...status, revision, generatedAt: new Date().toISOString(), categories, entries, analytics, rules, notifications };
    }
    throw new Error('Data changed during sync. Please retry.');
  }
}
