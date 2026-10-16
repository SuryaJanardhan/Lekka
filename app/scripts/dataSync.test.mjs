import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/dataSync.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { DataSync } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const apiCode = ts.transpileModule(readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ApiClient } = await import(`data:text/javascript;base64,${Buffer.from(apiCode).toString('base64')}`);
const now = new Date('2026-10-16T10:00:00Z');
const snapshot = revision => ({ schemaVersion: 1, revision, generatedAt: now.toISOString(), lastSuccessfulIngestionAt: '2026-10-15T18:58:00Z', categories: [], entries: [], rules: [], notifications: [], analytics: { period: { startDate: '2026-10-01T00:00:00Z' }, summary: { totalEmails: 0, totalFinancialAmount: 0 }, categoryBreakdown: [] } });
function fixture(saved = snapshot('1'), meta = { nextCheckAt: now.getTime() + 3600000 }) {
  const state = { saved, meta, reads: 0, snapshots: 0, status: 0, remote: snapshot('2'), serverStatus: snapshot('2'), fail: false, failStorage: false };
  const api = { getSnapshot: async () => { state.snapshots++; if (state.fail) throw Error('Offline'); return structuredClone(state.remote); }, getSyncStatus: async () => { state.status++; return state.serverStatus; } };
  const cache = { read: async () => { state.reads++; return structuredClone(state.saved); }, write: async value => { if (state.failStorage) throw Error('Quota'); state.saved = structuredClone(value); } };
  const metadata = { read: () => state.meta, write: meta => { state.meta = meta; } };
  return { state, create: () => new DataSync(api, cache, metadata, () => now) };
}
test('fresh cached reopen performs zero network reads', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) { const sync = f.create(); assert.equal((await sync.hydrate()).revision, '1'); assert.equal((await sync.synchronize()).network, false); }
  assert.equal(f.state.snapshots + f.state.status, 0);
});
test('first launch and concurrent refreshes download one complete snapshot', async () => {
  const f = fixture(null, {}), sync = f.create();
  await Promise.all([sync.synchronize(), sync.synchronize(), sync.synchronize()]);
  assert.equal(f.state.snapshots, 1);
  assert.equal(f.state.saved.revision, '2');
});
test('daily unchanged revision only requests lightweight status', async () => {
  const f = fixture(snapshot('1'), {});
  f.state.serverStatus = snapshot('1');
  await f.create().synchronize();
  assert.equal(f.state.status, 1);
  assert.equal(f.state.snapshots, 0);
});
test('changed server revision downloads and replaces deleted rows, never merges them', async () => {
  const old = snapshot('1'); old.entries = [{ _id: 'old', sender: 'Bank', receivedAt: now.toISOString(), parsedJson: {} }];
  const f = fixture(old, {});
  await f.create().synchronize();
  assert.deepEqual(f.state.saved.entries, []);
  assert.equal(f.state.saved.revision, '2');
});
test('force refresh ignores cache age and push keys are deduplicated', async () => {
  const f = fixture(), sync = f.create();
  assert.equal(sync.invalidate('push-1'), true);
  assert.equal(sync.invalidate('push-1'), false);
  await sync.synchronize(true);
  assert.equal(f.state.snapshots, 1);
  assert.equal(f.state.meta.dirty, false);
});
test('offline or partial snapshots never overwrite the last good local snapshot', async () => {
  const f = fixture(), sync = f.create();
  sync.invalidate(); f.state.fail = true;
  await assert.rejects(() => sync.synchronize(true), /Offline/);
  assert.equal(f.state.saved.revision, '1');
  f.state.fail = false; f.state.remote = { revision: '3' };
  await assert.rejects(() => sync.synchronize(true), /Incomplete/);
  assert.equal(f.state.saved.revision, '1');
  assert.equal(f.state.meta.dirty, true);
});
test('storage failure keeps persisted data intact and requests recovery next open', async () => {
  const f = fixture(); f.state.failStorage = true;
  const result = await f.create().synchronize(true);
  assert.equal(result.persisted, false);
  assert.equal(f.state.saved.revision, '1');
  assert.equal(f.state.meta.dirty, true);
});
test('midnight status check does not suppress a delayed ingestion check for the entire day', async () => {
  const f = fixture(snapshot('1'), {});
  f.state.serverStatus = { ...snapshot('1'), lastSuccessfulIngestionAt: '2026-10-14T18:58:00Z' };
  await f.create().synchronize();
  assert.equal(f.state.meta.nextCheckAt, now.getTime() + 1800000);
});

test('an ingestion in progress keeps saved data and retries status later', async () => {
  const f = fixture(snapshot('1'), {});
  f.state.serverStatus = { ...snapshot('2'), ingestionInProgress: true };
  assert.equal((await f.create().synchronize()).snapshot.revision, '1');
  assert.equal(f.state.snapshots, 0);
  assert.equal(f.state.meta.nextCheckAt, now.getTime() + 60000);
});

test('API mutations invalidate before the production request, but chat and token registration do not', async t => {
  const previous = globalThis.window;
  globalThis.window = globalThis;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const events = [];
  t.mock.method(globalThis, 'fetch', async () => { events.push('request'); return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }); });
  const api = new ApiClient({ baseUrl: 'https://example.com', apiSecret: 'fixture', onDataWrite: () => events.push('invalidate') });
  await api.createManualEntry({ title: 'Test', amount: 1 });
  assert.deepEqual(events, ['invalidate', 'request']);
  events.length = 0;
  await api.registerPushDevice('installation', 'fixture-token');
  await api.sendChatMessage({ sessionId: 'test', message: 'Test' });
  assert.deepEqual(events, ['request', 'request']);
});
