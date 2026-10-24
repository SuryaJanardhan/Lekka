import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
globalThis.crypto ||= webcrypto;
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const typesUrl = moduleUrl(compile('outboxTypes'));
const { Outbox } = await import(moduleUrl(compile('outbox').replace("'./outboxTypes'", JSON.stringify(typesUrl))));
const { projectOutbox } = await import(moduleUrl(compile('outboxProjection')));
const tick = () => new Promise(resolve => setImmediate(resolve));
class Store {
  rows = [];
  async list() { return structuredClone(this.rows); }
  async enqueue(kind, targetId, payload, base) {
    const op = { id: crypto.randomUUID(), scope: 'test', sequence: this.rows.length + 1, kind, targetId, payload, base, state: 'LOCAL', accepted: false, attempts: 0, nextAttemptAt: 0, createdAt: '2026-10-24T00:00:00.000Z' };
    this.rows.push(op); return op;
  }
  async update(op) { this.rows = this.rows.map(row => row.id === op.id ? structuredClone(op) : row); }
  async remove(id) { this.rows = this.rows.filter(row => row.id !== id); }
}
function apiDefaults(extra = {}) { return { submitOperation: async op => ({ id: op.id, state: 'PENDING' }), operationStatuses: async () => [], resolveOperation: async id => ({ id, state: 'CANCELLED' }), ...extra }; }

test('UI enqueue resolves after local persistence without waiting for a hung network request', async t => {
  const store = new Store(); let sending = false; let release;
  const api = apiDefaults({ submitOperation: () => { sending = true; return new Promise(resolve => { release = resolve; }); } });
  const queue = new Outbox(store, api, () => {}, async () => {}, () => {}); t.after(() => queue.stop());
  const op = await queue.enqueue('entry.create', 'entry', { title: 'Lunch', amount: 100 });
  assert.equal(store.rows.length, 1); assert.equal(sending, false);
  await queue.start(); await tick(); assert.equal(sending, true);
  assert.equal(store.rows[0].state, 'LOCAL');
  release({ id: op.id, state: 'PENDING' }); await tick(); queue.stop();
});

test('timeout after server commit retries the identical operation and retains confirmation until snapshot catches up', async t => {
  const store = new Store(); const committed = new Set(); const ids = []; let first = true;
  let visible = [];
  const queue = new Outbox(store, apiDefaults({ submitOperation: async op => {
    ids.push(op.id); committed.add(op.id);
    if (first) { first = false; throw new Error('Connection lost after commit'); }
    return { id: op.id, state: 'DONE', revision: '12', result: { _id: 'entry' } };
  } }), rows => { visible = rows; }, async () => {}, () => {}); t.after(() => queue.stop());
  await queue.enqueue('entry.create', 'entry', { title: 'Lunch', amount: 100 });
  await queue.start(); await tick();
  store.rows[0].nextAttemptAt = 0; await queue.pump(); await tick();
  assert.equal(committed.size, 1); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  assert.equal(store.rows[0].state, 'DONE');
  await queue.reconcile('11'); assert.equal(store.rows.length, 1);
  await queue.reconcile('12'); assert.equal(visible.length, 0); assert.equal(store.rows.length, 1);
  let otherTabVisible = [];
  const otherTab = new Outbox(store, apiDefaults(), rows => { otherTabVisible = rows; }, async () => {}, () => {});
  await otherTab.reconcile('11'); assert.equal(otherTabVisible.length, 1);
});

test('reopening resumes persisted changes and permanent rejections remain visible until explicit discard', async t => {
  const store = new Store(); const first = new Outbox(store, apiDefaults(), () => {}, async () => {}, () => {});
  await first.enqueue('entry.create', 'entry', { title: 'Lunch', amount: 100 }); first.stop();
  const queue = new Outbox(store, apiDefaults({ operationStatuses: async ids => ids.map(id => ({ id, state: 'BLOCKED', error: 'Choose a category' })) }), () => {}, async () => {}, () => {}); t.after(() => queue.stop());
  await queue.start(); await tick();
  assert.equal(store.rows[0].state, 'BLOCKED'); assert.equal(store.rows[0].error, 'Choose a category');
  await queue.resolve(store.rows[0].id, 'discard'); assert.equal(store.rows.length, 0);
});

test('storage failure cannot produce an optimistic change or a backend request', async () => {
  let changed = false; let sent = false;
  const store = new Store(); store.enqueue = async () => { throw new Error('Storage full'); };
  const queue = new Outbox(store, apiDefaults({ submitOperation: async () => { sent = true; } }), () => { changed = true; }, async () => {}, () => {});
  await assert.rejects(() => queue.enqueue('entry.create', 'entry', {}), /Storage full/);
  assert.equal(changed, false); assert.equal(sent, false);
});

test('pending projections remain visible without changing confirmed analytics or source snapshots', () => {
  const snapshot = { entries: [], categories: [], rules: [], notifications: [], analytics: { summary: { totalFinancialAmount: 250 } } };
  const projected = projectOutbox(snapshot, [{ id: 'op', kind: 'entry.create', targetId: 'entry', sequence: 1, state: 'LOCAL', createdAt: '2026-10-24T00:00:00.000Z', payload: { title: 'Lunch', amount: 100, date: '2026-10-24', paymentMode: 'UPI', transactionDirection: 'DEBIT' } }]);
  assert.equal(projected.entries[0].syncState, 'pending');
  assert.equal(projected.entries[0].parsedJson.detectedAmount, 100);
  assert.equal(projected.analytics.summary.totalFinancialAmount, 250);
  assert.equal(snapshot.entries.length, 0);
});

test('authentication rejection pauses uploads until an explicit retry', async t => {
  const store = new Store(); let calls = 0;
  const queue = new Outbox(store, apiDefaults({ submitOperation: async () => { calls++; throw Object.assign(new Error('Unauthorized'), { status: 401 }); } }), () => {}, async () => {}, () => {}); t.after(() => queue.stop());
  await queue.enqueue('entry.create', 'entry', { title: 'Lunch', amount: 100 });
  await queue.start(); await tick(); await queue.pump();
  assert.equal(calls, 1); assert.equal(store.rows[0].state, 'LOCAL');
  await queue.retryNow(); await tick(); assert.equal(calls, 2);
});
