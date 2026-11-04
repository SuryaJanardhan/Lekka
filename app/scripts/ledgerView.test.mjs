import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/format.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { directionOf, modeOf, newestFirst, shortDateTime } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('missing and old generic online modes default to UPI while user choices remain', () => {
  assert.equal(modeOf({}), 'UPI');
  assert.equal(modeOf({ parsedJson: { paymentMode: 'ONLINE' } }), 'UPI');
  assert.equal(modeOf({ parsedJson: { paymentMode: 'CASH' } }), 'CASH');
  assert.equal(modeOf({ parsedJson: { paymentMode: 'CARD' } }), 'CARD');
});
test('legacy entries remain debits and incoming credits are explicit', () => {
  assert.equal(directionOf({}), 'DEBIT');
  assert.equal(directionOf({ parsedJson: { transactionDirection: 'CREDIT' } }), 'CREDIT');
});
test('ledger ordering is newest transaction date and time first without mutating cached data', () => {
  const entries = [{ _id: 'old', receivedAt: '2026-11-01T23:59:00Z' }, { _id: 'same-older', receivedAt: '2026-11-02T00:01:00Z', processedAt: '2026-11-02T01:00:00Z' }, { _id: 'same-newer', receivedAt: '2026-11-02T00:01:00Z', processedAt: '2026-11-02T02:00:00Z' }, { _id: 'middle', receivedAt: '2026-11-02T00:00:00Z' }];
  assert.deepEqual(newestFirst(entries).map(entry => entry._id), ['same-newer', 'same-older', 'middle', 'old']);
  assert.equal(entries[0]._id, 'old');
  assert.match(shortDateTime('2026-11-02T18:30:00Z'), /03 Nov/);
});
test('transaction detail omits classification provenance while retaining payment mode', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /label="Category source"/);
  assert.match(app, /label="Mode" value=\{modeOf\(entry\)\}/);
  assert.doesNotMatch(app, /Original receipt|className="receipt-details"/);
  assert.doesNotMatch(app, /label="Sender"|\{entry.sender\} ·/);
  assert.match(app, /className="transaction-notes"/);
});
