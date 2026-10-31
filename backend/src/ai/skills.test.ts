import test from 'node:test';
import assert from 'node:assert/strict';
import { namedPeriod, parsePeriods } from './periods';
import { buildRequest, chooseSkill } from './router';
import { validateRequest } from './contract';
import { detectWatchFindings } from './watchDetection';
import { inputUpperBound } from './provider';
const now = new Date('2026-10-30T02:00:00Z');

test('skill periods use IST boundaries across month and year transitions', () => {
  const period = parsePeriods('last month', false, now)[0];
  assert.equal(period.start, '2026-08-31T18:30:00.000Z');
  assert.equal(period.end, '2026-09-30T18:30:00.000Z');
  assert.equal(namedPeriod('last_month', new Date('2026-01-01T01:00:00Z')).start, '2025-11-30T18:30:00.000Z');
  assert.equal(parsePeriods('2026-10-01 to 2026-10-02', false, now)[0].end, '2026-10-02T18:30:00.000Z');
  assert.throws(() => parsePeriods('2026-02-30', false, now), /Invalid calendar/);
  assert.throws(() => parsePeriods('September', true, now), /both comparison/);
  assert.equal(parsePeriods('2025', false, now)[0].start, '2024-12-31T18:30:00.000Z');
  assert.equal(parsePeriods('last quarter', false, now)[0].start, '2026-06-30T18:30:00.000Z');
  assert.throws(() => parsePeriods('all time', false, now), /named periods/);
});
test('skills resolve exact category mode direction and bounded pagination', () => {
  assert.equal(chooseSkill('@compare'), 'compare');
  assert.throws(() => chooseSkill('@delete'), /Unknown skill/);
  const request = buildRequest('spending', '@spending Food UPI credits last month', ['Food', 'Office Travel'], now);
  assert.equal(request.category, 'Food'); assert.equal(request.mode, 'UPI'); assert.equal(request.direction, 'CREDIT');
  const search = buildRequest('search', '@search ".*" last month page 2', [], now);
  assert.equal(search.term, '.*'); assert.equal(search.page, 2);
  assert.equal(chooseSkill('HungerBox last month @search'), 'search');
  const debitSearch = buildRequest('search', '@search HungerBox debits September 2026', [], now);
  assert.equal(debitSearch.direction, 'DEBIT'); assert.equal(debitSearch.term, 'HungerBox'); assert.equal(debitSearch.range.start, '2026-08-31T18:30:00.000Z');
  assert.equal(buildRequest('search', '@search HungerBox September 2026', [], now).term, 'HungerBox');
  assert.equal(buildRequest('spending', '@spending Shopping online', ['Shopping online'], now).mode, undefined);
  assert.equal(buildRequest('search', '@search "Credit Union"', [], now).direction, 'BOTH');
  assert.throws(() => validateRequest({ ...request, page: 1000 }), /page/);
  assert.throws(() => buildRequest('spending', 'bank balance', [], now), /not your bank balance/);
  assert.throws(() => buildRequest('spending', '@spending Fod last month', ['Food'], now), /could not identify/);
});
test('watch flags possible duplicates without treating them as proven or editing anything', () => {
  const recent = [{ _id: 'one', subject: 'Shop', receivedAt: new Date('2026-10-29T20:00:00Z'), parsedJson: { detectedAmount: 120, merchantName: 'Shop' } }, { _id: 'two', subject: 'Shop', receivedAt: new Date('2026-10-29T20:04:00Z'), parsedJson: { detectedAmount: 120, merchantName: 'Shop' } }];
  const before = JSON.stringify(recent);
  const found = detectWatchFindings({ recent, average: 0, baselineCount: 0, growth: [], categories: [] });
  assert.equal(found.length, 1); assert.match(found[0].message, /Possible duplicate/); assert.match(found[0].message, /legitimate separate/);
  assert.equal(JSON.stringify(recent), before);
  assert.deepEqual(detectWatchFindings({ recent: [], average: 0, baselineCount: 0, growth: [], categories: [] }), []);
});
test('watch needs enough baseline and caps findings while preserving stable deduplication IDs', () => {
  const recent = Array.from({ length: 10 }, (_, i) => ({ _id: String(i), subject: `Shop ${i}`, receivedAt: new Date(), parsedJson: { detectedAmount: 2000 } }));
  const input = { recent, average: 10000, baselineCount: 5, growth: [], categories: [] };
  assert.equal(detectWatchFindings(input).length, 3);
  assert.deepEqual(detectWatchFindings(input), detectWatchFindings(input));
  assert.equal(detectWatchFindings({ ...input, baselineCount: 4 }).length, 0);
});
test('small-model context accounting includes UTF-8 data and message framing', () => {
  assert.ok(inputUpperBound([{ role: 'user', content: 'Hello' }]) > 96);
  assert.ok(inputUpperBound([{ role: 'user', content: '\u0c05'.repeat(500) }]) > 800);
});

test('growth flags are scoped to their comparison windows', () => {
  const data = { recent: [{ _id: 'one', categoryId: 'food', parsedJson: {} }], average: 0, baselineCount: 0, categories: [{ _id: 'food', name: 'Food' }], growth: [{ _id: { category: 'food', current: true }, amount: 300000, count: 4 }, { _id: { category: 'food', current: false }, amount: 100000, count: 3 }] };
  const first = detectWatchFindings({ ...data, windowKey: '2026-10-01' });
  const later = detectWatchFindings({ ...data, windowKey: '2026-10-15' });
  assert.equal(first.length, 1); assert.notEqual(first[0].id, later[0].id);
});
