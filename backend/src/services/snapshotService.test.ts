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
import { SyncDeletionModel } from '../models/SyncDeletion';

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

test('legacy snapshots exclude credits while credit-aware clients can request both flows', async t => {
  t.mock.method(DataRevisionModel, 'findById', () => query({ version: 7 }));
  t.mock.method(SyncStateModel, 'findOne', () => query(null));
  t.mock.method(CategoryModel, 'find', () => query([]));
  t.mock.method(RuleModel, 'find', () => query([]));
  t.mock.method(LedgerReportService, 'getDashboardStats', async () => ({ summary: {} }));
  t.mock.method(notificationService, 'getNotifications', async () => []);
  const filters: any[] = [];
  t.mock.method(EmailModel, 'find', (filter: any) => { filters.push(filter); return query([]); });
  await SnapshotService.snapshot();
  await SnapshotService.snapshot(true);
  assert.deepEqual(filters[0]['parsedJson.transactionDirection'], { $ne: 'CREDIT' });
  assert.ok(filters[0].updatedAt.$lte instanceof Date);
  assert.equal(filters[1]['parsedJson.transactionDirection'], undefined);
  assert.ok(filters[1].updatedAt.$lte instanceof Date);
});

test('incremental sync returns compact changed entries and deletion tombstones', async t => {
  t.mock.method(DataRevisionModel, 'findById', () => query({ version: 9 }));
  t.mock.method(SyncStateModel, 'findOne', () => query(null));
  t.mock.method(CategoryModel, 'find', () => query([]));
  t.mock.method(RuleModel, 'find', () => query([]));
  t.mock.method(EmailModel, 'find', () => query([{ _id: 'changed', sender: 'bank', subject: 'Paid', rawTextBody: 'x'.repeat(1200), ocrExtractedText: 'private OCR', parsedJson: { detectedAmount: 10, rawSummary: 'private raw summary' }, updatedAt: new Date() }]));
  t.mock.method(SyncDeletionModel, 'find', () => query([{ recordId: 'deleted' }]));
  t.mock.method(LedgerReportService, 'getDashboardStats', async () => ({ summary: {} }));
  t.mock.method(notificationService, 'getNotifications', async () => []);
  const changes = await SnapshotService.changes('2026-01-01T00:00:00.000Z', true);
  assert.deepEqual(changes.deletedEntryIds, ['deleted']);
  assert.equal(changes.entries[0].rawTextBody.length, 800);
  assert.equal('ocrExtractedText' in changes.entries[0], false);
  assert.equal('rawSummary' in changes.entries[0].parsedJson, false);
});
