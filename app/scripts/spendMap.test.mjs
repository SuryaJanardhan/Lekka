import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/spendMap.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { spendMapRows, shareOf, categorySpendForIstDay, categorySpendForIstRange, currentWeekDaysForIst, ledgerMonthOptions, ledgerBreakdownForIstMonth } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

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

test('stats month options include current month and transaction months newest first in IST', () => {
  const months = ledgerMonthOptions([
    { receivedAt: '2026-09-30T18:29:00Z' },
    { receivedAt: '2026-09-30T18:31:00Z' },
    { receivedAt: '2026-08-02T10:00:00Z' }
  ], new Date('2026-11-14T10:00:00Z'));
  assert.deepEqual(months, ['2026-11', '2026-10', '2026-09', '2026-08']);
});

test('stats breakdown filters the selected IST month and direction and groups categories and modes', () => {
  const entries = [
    { receivedAt: '2026-09-30T18:31:00Z', categoryId: { name: 'Food', colorCode: '#111' }, parsedJson: { detectedAmount: 100, paymentMode: 'UPI' } },
    { receivedAt: '2026-10-02T10:00:00Z', categoryId: { name: 'Travel', colorCode: '#222' }, parsedJson: { detectedAmount: 50, paymentMode: 'CARD' } },
    { receivedAt: '2026-10-03T10:00:00Z', categoryId: { name: 'Food', colorCode: '#111' }, parsedJson: { detectedAmount: 400, transactionDirection: 'CREDIT', paymentMode: 'UPI' } }
  ];
  const debit = ledgerBreakdownForIstMonth(entries, '2026-10', 'DEBIT', [{ name: 'Movies', colorCode: '#333' }]);
  assert.equal(debit.total, 150);
  assert.deepEqual(debit.categories.map(row => [row.label, row.value]), [['Food', 100], ['Travel', 50], ['Movies', 0]]);
  assert.deepEqual(debit.modes.map(row => [row.label, row.value]), [['UPI', 100], ['CARD', 50]]);
  const credit = ledgerBreakdownForIstMonth(entries, '2026-10', 'CREDIT');
  assert.equal(credit.total, 400);
  assert.deepEqual(credit.categories.map(row => [row.label, row.value]), [['Food', 400]]);
});

test('monthly stats gives repeated default category colors distinct stable chart colors', () => {
  const catalog = ['Food', 'Travel', 'Groceries', 'Medicine', 'Movies'].map(name => ({ name, colorCode: '#0f766e' }));
  const entries = catalog.map((category, index) => ({
    receivedAt: `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    categoryId: category,
    parsedJson: { detectedAmount: (index + 1) * 10 }
  }));
  const rows = ledgerBreakdownForIstMonth(entries, '2026-10', 'DEBIT', catalog).categories;
  assert.equal(new Set(rows.map(row => row.color)).size, catalog.length);
  const again = ledgerBreakdownForIstMonth(entries, '2026-10', 'DEBIT', catalog).categories;
  assert.deepEqual(rows.map(row => [row.label, row.color]), again.map(row => [row.label, row.color]));
});

test('week days in IST spans Monday to Sunday with correct daily spend and week totals', () => {
  const fixedNow = new Date('2026-11-21T10:00:00.000Z'); // Saturday 21 Nov 15:30 IST
  const entries = [
    { receivedAt: '2026-11-16T10:00:00Z', categoryId: { name: 'Groceries' }, parsedJson: { detectedAmount: 200 } },
    { receivedAt: '2026-11-19T05:00:00Z', categoryId: { name: 'Food' }, parsedJson: { detectedAmount: 50 } },
    { receivedAt: '2026-11-19T08:00:00Z', categoryId: { name: 'Food' }, parsedJson: { detectedAmount: 25 } },
    { receivedAt: '2026-11-20T10:00:00Z', categoryId: { name: 'Travel' }, parsedJson: { detectedAmount: 100 } },
    { receivedAt: '2026-11-20T11:00:00Z', categoryId: { name: 'Travel' }, parsedJson: { detectedAmount: 500, transactionDirection: 'CREDIT' } }
  ];

  const week = currentWeekDaysForIst(entries, fixedNow);
  assert.equal(week.days.length, 7);
  assert.equal(week.startDay, '2026-11-16');
  assert.equal(week.endDay, '2026-11-22');
  assert.equal(week.weekTotal, 375); // 200 + 75 + 100

  const monday = week.days.find(d => d.key === '2026-11-16');
  assert.equal(monday?.totalSpend, 200);

  const thursday = week.days.find(d => d.key === '2026-11-19');
  assert.equal(thursday?.totalSpend, 75);

  const saturday = week.days.find(d => d.key === '2026-11-21');
  assert.equal(saturday?.isToday, true);
  assert.equal(saturday?.totalSpend, 0);

  const rangeSpend = categorySpendForIstRange(entries, week.startDay, week.endDay);
  assert.deepEqual(rangeSpend.map(r => [r.label, r.value]), [['Groceries', 200], ['Travel', 100], ['Food', 75]]);

  const thuSpend = categorySpendForIstDay(entries, '2026-11-19');
  assert.deepEqual(thuSpend.map(r => [r.label, r.value]), [['Food', 75]]);
});
