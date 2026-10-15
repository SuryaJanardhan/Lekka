import test from 'node:test';
import assert from 'node:assert/strict';
import { digestPeriod, digestText, DigestTotals } from './pushSummary';

test('weekday evenings do not generate routine spending notifications', () => {
  assert.equal(digestPeriod('evening', new Date('2026-10-15T15:30:00Z')).report, null);
});

test('weekly report starts Monday in IST and ends at actual invocation time', () => {
  const now = new Date('2026-10-18T15:48:00Z');
  const period = digestPeriod('evening', now);
  assert.equal(period.report, 'weekly');
  assert.equal(period.start.toISOString(), '2026-10-11T18:30:00.000Z');
  assert.equal(period.end.toISOString(), now.toISOString());
});

test('month-end report handles February, leap years, and year boundaries', () => {
  for (const date of ['2026-02-28', '2028-02-29', '2026-12-31']) {
    assert.equal(digestPeriod('evening', new Date(date + 'T15:30:00Z')).report, 'monthly');
  }
  assert.equal(digestPeriod('evening', new Date('2028-02-28T15:30:00Z')).report, null);
  assert.equal(digestPeriod('evening', new Date('2026-10-31T19:00:00Z')).report, 'weekly');
});

test('month-end Sunday combines the monthly report with weekly spending', () => {
  const period = digestPeriod('evening', new Date('2026-05-31T15:30:00Z'));
  assert.equal(period.report, 'monthly');
  assert.equal(period.weekEnd, true);
  assert.equal(period.start.toISOString(), '2026-04-30T18:30:00.000Z');
});

const totals: DigestTotals = { spend: 120, count: 1, monthSpend: 400, weekSpend: 120, pending: 2, pendingEntries: 1, uncategorized: 1, emailReviews: 1, examples: ['Grocery: INR 120', 'Axis receipt: amount missing'], includeWeek: true };

test('review reminders explain both pending work and its context', () => {
  const text = digestText('review', totals, new Date('2026-10-15T03:30:00Z'));
  assert.match(text.message, /1 uncategorized/);
  assert.match(text.message, /1 email needs a manual amount check/);
  assert.match(text.message, /Grocery: INR 120/);
});

test('financial summaries name the recorded period and cutoff', () => {
  const text = digestText('monthly', totals, new Date('2026-05-31T15:30:00Z'));
  assert.match(text.title, /May/);
  assert.match(text.message, /Recorded this month: INR 120 across 1 expense/);
  assert.match(text.message, /This week: INR 120/);
  assert.match(text.message, /IST/);
});
