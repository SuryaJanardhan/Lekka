import test from 'node:test';
import assert from 'node:assert/strict';
import { InsightReportService } from './insightReportService';
import { LedgerReportService } from './ledgerReportService';
import { EmailModel } from '../models/Email';
import { InsightReportModel } from '../models/InsightReport';
import { DataRevisionModel } from '../models/DataRevision';

const report = (spend: number, credits: number, name: string) => ({
  period: { startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-11-01T00:00:00.000Z' },
  summary: { totalFinancialAmount: spend, totalCredits: credits, netAmount: credits - spend, debitCount: 3, creditCount: 1, totalTransactions: 4, pendingReviews: 2 },
  categoryBreakdown: [{ categoryName: name, totalAmount: spend, creditAmount: credits, count: 3 }],
  paymentModeBreakdown: [{ mode: 'UPI', totalAmount: spend, creditAmount: credits, count: 4 }]
});

test('monthly report stores deterministic facts, comparison, top categories and largest entries', async t => {
  t.mock.method(LedgerReportService, 'getDashboardStats', async (input: any) => input.endDate.startsWith('2026-11') ? report(1000, 200, 'Food') : report(500, 50, 'Food'));
  t.mock.method(EmailModel, 'find', () => ({ populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [{ subject: 'Lunch', receivedAt: new Date('2026-10-15'), parsedJson: { detectedAmount: 900, transactionDirection: 'DEBIT', merchantName: 'Lunch' }, categoryId: { name: 'Food' } }] }));
  t.mock.method(InsightReportModel, 'findOneAndUpdate', (_filter: any, update: any) => ({ lean: async () => update.$set } as any));
  t.mock.method(DataRevisionModel, 'findById', () => ({ lean: async () => ({ version: 'revision-1' }) } as any));
  const result: any = await InsightReportService.generate('monthly', new Date('2026-10-01'), new Date('2026-11-01'), new Date('2026-11-01'));
  assert.equal(result.periodKey, 'monthly:2026-10-01');
  assert.equal(result.summary.spend, 1000); assert.equal(result.summary.credits, 200); assert.equal(result.comparison.previousSpend, 500);
  assert.equal(result.topCategories[0].name, 'Food'); assert.equal(result.largestTransactions[0].title, 'Lunch'); assert.equal(result.sourceRevision, 'revision-1');
});

test('review digest does not generate a weekly/monthly report', async () => {
  assert.equal(await InsightReportService.generateForDigest('review', { report: 'review' } as any), null);
});
