import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailModel } from '../models/Email';
import { LedgerReportService } from './ledgerReportService';
import { CategoryModel } from '../models/Category';

test('yearly trend keeps four-digit years and does not change monthly date keys', async (t) => {
  t.mock.method(CategoryModel, 'find', () => ({ sort() { return this; }, lean: async () => [] }));
  t.mock.method(EmailModel, 'aggregate', async (pipeline: any[]) => {
    const group = pipeline.find(stage => stage.$group)?.$group;
    if (group?._id?.$dateToString?.format === '%Y') return [{ _id: '2026', totalAmount: 76, count: 5 }];
    if (group?._id?.$dateToString?.format === '%Y-%m') return [{ _id: '2026-10', totalAmount: 76, count: 5 }];
    return [];
  });
  t.mock.method(EmailModel, 'countDocuments', async () => 0);
  const report = await LedgerReportService.getDashboardStats({ now: new Date('2026-10-16T12:00:00Z') });
  assert.deepEqual(report.yearlyTrend, [{ year: '2026', totalAmount: 76, creditAmount: 0, count: 5 }]);
  assert.equal(report.monthlyTrend[0].month, '2026-10');
});

test('reports include every database category with unique colors and separate credits', async t => {
  const categories = Array.from({ length: 18 }, (_, index) => ({ _id: `cat-${index}`, name: `Category ${index}`, colorCode: '#0f766e' }));
  t.mock.method(CategoryModel, 'find', () => ({ sort() { return this; }, lean: async () => categories }));
  t.mock.method(EmailModel, 'aggregate', async (pipeline: any[]) => {
    const group = pipeline.find(stage => stage.$group)?.$group;
    if (group?._id === null) return [{ totalEmails: 1, totalTransactions: 2, totalFinancialAmount: 100, totalCredits: 250, creditCount: 1 }];
    if (group?._id === '$categoryId') return [{ _id: 'cat-1', totalAmount: 100, creditAmount: 250, count: 2 }];
    return [];
  });
  t.mock.method(EmailModel, 'countDocuments', async () => 0);
  const report = await LedgerReportService.getDashboardStats();
  assert.equal(report.summary.totalFinancialAmount, 100);
  assert.equal(report.summary.totalCredits, 250);
  assert.equal(report.summary.netAmount, 150);
  assert.equal(report.categoryBreakdown.length, 18);
  assert.equal(new Set(report.categoryBreakdown.map(c => c.colorCode)).size, 18);
});
