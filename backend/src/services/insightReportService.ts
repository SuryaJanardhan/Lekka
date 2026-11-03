import { EmailModel } from '../models/Email';
import { InsightReportModel } from '../models/InsightReport';
import { LedgerReportService } from './ledgerReportService';
import { dataRevision } from './dataRevisionService';
import { digestPeriod, DigestReport } from './pushSummary';

export class InsightReportService {
  static async generate(kind: 'weekly' | 'monthly', start: Date, end: Date, now = new Date()) {
    const periodKey = `${kind}:${start.toISOString().slice(0, 10)}`;
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const [current, previous, largest, revision] = await Promise.all([
      LedgerReportService.getDashboardStats({ startDate: start.toISOString(), endDate: end.toISOString(), now }),
      LedgerReportService.getDashboardStats({ startDate: previousStart.toISOString(), endDate: start.toISOString(), now }),
      EmailModel.find({ receivedAt: { $gte: start, $lt: end }, 'parsedJson.detectedAmount': { $gt: 0 } }).populate('categoryId').sort({ 'parsedJson.detectedAmount': -1 }).limit(5).lean(),
      dataRevision()
    ]);
    const spend = current.summary.totalFinancialAmount || 0, previousSpend = previous.summary.totalFinancialAmount || 0;
    const credits = current.summary.totalCredits || 0, previousCredits = previous.summary.totalCredits || 0;
    const categoryPrevious = new Map(previous.categoryBreakdown.map(row => [row.categoryName, row.totalAmount || 0]));
    const report = {
      periodKey, kind, period: current.period,
      summary: { spend, credits, net: current.summary.netAmount || 0, debitCount: current.summary.debitCount || 0, creditCount: current.summary.creditCount || 0, totalTransactions: current.summary.totalTransactions || 0 },
      topCategories: current.categoryBreakdown.filter(row => (row.totalAmount || 0) > 0).slice(0, 8).map(row => {
        const old = categoryPrevious.get(row.categoryName) || 0; const amount = row.totalAmount || 0;
        return { name: row.categoryName, spend: amount, credits: row.creditAmount || 0, count: row.count || 0, changePercent: old ? (amount - old) / old * 100 : null };
      }),
      paymentModes: (current.paymentModeBreakdown || []).map(row => ({ mode: row.mode, spend: row.totalAmount || 0, credits: row.creditAmount || 0, count: row.count || 0 })),
      largestTransactions: largest.map(row => ({ title: String(row.parsedJson?.merchantName || row.subject).slice(0, 100), amount: Number(row.parsedJson?.detectedAmount || 0), direction: row.parsedJson?.transactionDirection || 'DEBIT', category: (row.categoryId as any)?.name || 'Unassigned', date: row.receivedAt })),
      comparison: { previousLabel: kind === 'weekly' ? 'previous week' : 'previous month', previousSpend, spendDelta: spend - previousSpend, spendChangePercent: previousSpend ? (spend - previousSpend) / previousSpend * 100 : null, previousCredits, creditsDelta: credits - previousCredits },
      pendingReviews: current.summary.pendingReviews || 0, sourceRevision: revision, generatedAt: now
    };
    return InsightReportModel.findOneAndUpdate({ periodKey }, { $set: report }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  }

  static async generateForDigest(report: DigestReport, period: ReturnType<typeof digestPeriod>, now = new Date()) {
    if (report !== 'weekly' && report !== 'monthly') return null;
    return this.generate(report, period.start, period.end, now);
  }

  static async list(limit = 24) {
    return InsightReportModel.find({}).sort({ 'period.startDate': -1 }).limit(Math.min(Math.max(limit, 1), 24)).lean();
  }

  static async get(periodKey: string) {
    return InsightReportModel.findOne({ periodKey }).lean();
  }
}
