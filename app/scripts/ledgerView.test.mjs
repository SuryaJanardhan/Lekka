import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/format.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { directionOf, modeOf } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

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
test('transaction detail omits classification provenance while retaining payment mode', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /label="Category source"/);
  assert.match(app, /label="Mode" value=\{modeOf\(entry\)\}/);
});
