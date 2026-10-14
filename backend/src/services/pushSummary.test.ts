import test from 'node:test';
import assert from 'node:assert/strict';
import { digestPeriod, digestText } from './pushSummary';

test('morning summary uses yesterday in IST across a month boundary', () => {
  const period = digestPeriod('morning', new Date('2026-11-01T03:30:00Z'));
  assert.equal(period.start.toISOString(), '2026-10-30T18:30:00.000Z');
  assert.equal(period.end.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(period.monthStart.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(period.key, '2026-11-01-morning');
});

test('evening summary includes only today until the actual send time', () => {
  const now = new Date('2026-10-14T15:30:00Z');
  const period = digestPeriod('evening', now);
  assert.equal(period.start.toISOString(), '2026-10-13T18:30:00.000Z');
  assert.equal(period.end.toISOString(), now.toISOString());
  assert.equal(period.key, '2026-10-14-evening');
});

test('summaries describe zero spending honestly and include pending review counts', () => {
  assert.match(digestText('morning', { spend: 0, count: 0, monthSpend: 400, pending: 0 }).message, /Yesterday: INR 0 across 0 expenses/);
  assert.match(digestText('evening', { spend: 120, count: 1, monthSpend: 400, pending: 2 }).message, /Today: INR 120 across 1 expense.*2 items need review/);
});
