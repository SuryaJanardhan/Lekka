import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailModel } from '../models/Email';
import { LedgerReportService } from './ledgerReportService';

test('yearly trend keeps four-digit years and does not change monthly date keys', async (t) => {
  t.mock.method(EmailModel, 'aggregate', async (pipeline: any[]) => {
    const group = pipeline.find(stage => stage.$group)?.$group;
    if (group?._id?.$dateToString?.format === '%Y') return [{ _id: '2026', totalAmount: 76, count: 5 }];
    if (group?._id?.$dateToString?.format === '%Y-%m') return [{ _id: '2026-10', totalAmount: 76, count: 5 }];
    return [];
  });
  t.mock.method(EmailModel, 'countDocuments', async () => 0);
  const report = await LedgerReportService.getDashboardStats({ now: new Date('2026-10-16T12:00:00Z') });
  assert.deepEqual(report.yearlyTrend, [{ year: '2026', totalAmount: 76, count: 5 }]);
  assert.equal(report.monthlyTrend[0].month, '2026-10');
});
