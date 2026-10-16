import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotService, snapshotMonth } from './snapshotService';
import { DataRevisionModel } from '../models/DataRevision';
import { CategoryModel } from '../models/Category';
import { EmailModel } from '../models/Email';
import { RuleModel } from '../models/Rule';
import { SyncStateModel } from '../models/SyncState';
import { LedgerReportService } from './ledgerReportService';
import { notificationService } from './notificationService';

function query(value: any): any { return { sort() { return this; }, populate() { return this; }, select() { return this; }, lean: async () => value }; }

test('snapshot includes the complete ledger, not the old 250-entry UI limit', async (t) => {
  const entries = Array.from({ length: 300 }, (_, i) => ({ _id: String(i) }));
  t.mock.method(DataRevisionModel, 'findById', () => query({ version: 7 }));
  t.mock.method(CategoryModel, 'find', () => query([]));
  t.mock.method(EmailModel, 'find', () => query(entries));
  t.mock.method(RuleModel, 'find', () => query([]));
  t.mock.method(SyncStateModel, 'findOne', () => query(null));
  t.mock.method(LedgerReportService, 'getDashboardStats', async () => ({ summary: {} }));
  t.mock.method(notificationService, 'getNotifications', async () => []);
  const snapshot = await SnapshotService.snapshot();
  assert.equal(snapshot.entries.length, 300);
  assert.equal(snapshot.revision, '7');
});

test('a failed component rejects the whole snapshot rather than returning empty data', async (t) => {
  t.mock.method(DataRevisionModel, 'findById', () => query({ version: 1 }));
  t.mock.method(CategoryModel, 'find', () => query([]));
  t.mock.method(EmailModel, 'find', () => query([]));
  t.mock.method(RuleModel, 'find', () => query([]));
  t.mock.method(SyncStateModel, 'findOne', () => query(null));
  t.mock.method(LedgerReportService, 'getDashboardStats', async () => { throw Error('Reports unavailable'); });
  t.mock.method(notificationService, 'getNotifications', async () => []);
  await assert.rejects(() => SnapshotService.snapshot(), /Reports unavailable/);
});

test('snapshot report month follows IST across midnight and year rollover without changing transaction dates', () => {
  assert.deepEqual(snapshotMonth(new Date('2026-12-31T19:00:00Z')), { startDate: '2026-12-31T18:30:00.000Z', endDate: '2027-01-31T18:30:00.000Z' });
});

test('an active ingestion never exposes a half-imported snapshot', async t => {
  t.mock.method(DataRevisionModel, 'findById', () => query({ version: 7 }));
  t.mock.method(SyncStateModel, 'findOne', () => query({ ingestionLockUntil: new Date(Date.now() + 60000) }));
  const entries = t.mock.method(EmailModel, 'find', () => { throw Error('Must not read partial ledger'); });
  await assert.rejects(() => SnapshotService.snapshot(), /Ingestion is still running/);
  assert.equal(entries.mock.callCount(), 0);
});
