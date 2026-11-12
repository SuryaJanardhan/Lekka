import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/spendMap.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { spendMapRows, shareOf, categorySpendForIstDay } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('largest categories come first without mutating the source or omitting zero categories', () => {
  const rows = [{ label: 'Movies', value: 0 }, { label: 'Food', value: 20 }, { label: 'Travel', value: 100 }];
  assert.deepEqual(spendMapRows(rows).map(row => row.label), ['Travel', 'Food', 'Movies']);
  assert.equal(rows[0].label, 'Movies');
});
test('category search includes zero-value and new categories, independent of case', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ label: `Category ${i}`, value: i }));
  assert.equal(spendMapRows(rows).length, 150);
  assert.equal(spendMapRows(rows, ' CATEGORY 0 ')[0].value, 0);
  assert.equal(spendMapRows(rows, 'missing').length, 0);
});
test('shares are proportional with no invented minimum for tiny or zero amounts', () => {
  assert.equal(shareOf(1, 1000), .1);
  assert.equal(shareOf(0, 0), 0);
  assert.equal(shareOf(50, 100), 50);
  assert.equal(shareOf(200, 100), 100);
});
test('home day map uses IST today, confirmed debits only, and groups categories', () => {
  const now = new Date('2026-11-12T18:31:00Z'); // 13 Nov 00:01 IST
  const rows = categorySpendForIstDay([
    { receivedAt: '2026-11-12T18:29:00Z', categoryId: { name: 'Food', colorCode: '#111111' }, parsedJson: { detectedAmount: 50 } },
    { receivedAt: '2026-11-12T18:30:00Z', categoryId: { name: 'Food', colorCode: '#111111' }, parsedJson: { detectedAmount: 30 } },
    { receivedAt: '2026-11-12T19:00:00Z', categoryId: { name: 'Travel' }, parsedJson: { detectedAmount: 100 } },
    { receivedAt: '2026-11-12T19:10:00Z', categoryId: { name: 'Travel' }, parsedJson: { detectedAmount: 500, transactionDirection: 'CREDIT' } }
  ], now);
  assert.deepEqual(rows.map(row => [row.label, row.value]), [['Travel', 100], ['Food', 30]]);
});
