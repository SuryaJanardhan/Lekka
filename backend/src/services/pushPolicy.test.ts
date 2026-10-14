import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteNotificationTarget } from './pushPolicy';

test('review emails and reminders receive remote alerts', () => {
  assert.equal(remoteNotificationTarget('REVIEW', {}), 'review');
  assert.equal(remoteNotificationTarget('REMINDER', {}), 'insights');
});

test('automatic sync alerts report new expenses or failures', () => {
  assert.equal(remoteNotificationTarget('SYNC', { newIngested: 2 }), 'ledger');
  assert.equal(remoteNotificationTarget('SYNC', { newIngested: 2, needsReviewCount: 1 }), 'review');
  assert.equal(remoteNotificationTarget('SYNC', { status: 'failed' }), 'settings');
});

test('empty syncs, manual sync duplicates, and unlock feedback do not generate remote alerts', () => {
  assert.equal(remoteNotificationTarget('SYNC', { newIngested: 0 }), null);
  assert.equal(remoteNotificationTarget('SYNC', { source: 'manual', newIngested: 2 }), null);
  assert.equal(remoteNotificationTarget('SECURITY', {}), null);
});
