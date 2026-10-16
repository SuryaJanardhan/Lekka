import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationModel } from '../models/Notification';
import { notificationService, NotificationController } from './notificationService';
import { PushService } from './pushService';

test('clear all hides alerts and clears reminders without deleting their dedupe metadata', async (t) => {
  let change: any;
  let filter: any;
  t.mock.method(NotificationModel, 'updateMany', async (query: any, update: any) => { filter = query; change = update; return { modifiedCount: 3 }; });
  assert.equal(await notificationService.clearAll(), 3);
  assert.deepEqual(filter, { dismissed: { $ne: true } });
  assert.deepEqual(change, { $set: { read: true, dismissed: true } });
});

test('a pending category review saves one contextual alert and sends real push transport', async (t) => {
  let exists = false;
  let stored: any;
  t.mock.method(NotificationModel, 'exists', async () => exists ? { _id: 'notification' } : null);
  t.mock.method(NotificationModel, 'create', async (data: any) => { stored = data; exists = true; return { ...data, _id: 'notification', createdAt: new Date(), read: false }; });
  t.mock.method(NotificationModel, 'updateOne', async () => undefined);
  t.mock.method(PushService, 'isConfigured', () => true);
  const send = t.mock.method(PushService, 'send', async () => ({ sent: 1, failed: 0, registered: 1 }));
  const entry = { _id: 'entry', messageId: 'mail', subject: 'Receipt', sender: 'bank@example.com', needsUserReview: true, parsedJson: { detectedAmount: 16, merchantName: 'HungerBox' } };
  const result = await notificationService.notifyCategoryReview(entry);
  await notificationService.notifyCategoryReview(entry);
  assert.equal(send.mock.callCount(), 1);
  assert.match(stored.message, /HungerBox: INR 16/);
  assert.equal(stored.metadata.reviewKind, 'category');
  assert.equal(send.mock.calls[0].arguments[3], 'review');
  assert.equal(result?.remoteDelivery?.sent, 1);
});

test('failed FCM transport remains visible as failed instead of pretending delivery', async (t) => {
  let recorded: any;
  t.mock.method(NotificationModel, 'create', async (data: any) => ({ ...data, _id: 'notification', createdAt: new Date(), read: false }));
  t.mock.method(NotificationModel, 'updateOne', async (_query: any, update: any) => { recorded = update; });
  t.mock.method(PushService, 'isConfigured', () => true);
  t.mock.method(PushService, 'send', async () => { throw new Error('Transport failed'); });
  const result = await notificationService.addNotification('Review', 'Choose category', 'REVIEW');
  assert.equal(result.remoteDelivery?.failed, 1);
  assert.equal(recorded.$set['metadata.remoteDelivery'].sent, 0);
});

test('approving a category dismisses only its matching category review notification', async (t) => {
  let query: any, update: any;
  t.mock.method(NotificationModel, 'updateMany', async (q: any, u: any) => { query = q; update = u; });
  await notificationService.resolveCategoryReview('entry');
  assert.equal(query['metadata.entryId'], 'entry');
  assert.equal(query['metadata.reviewKind'], 'category');
  assert.deepEqual(update.$set, { read: true, dismissed: true });
});
test('notification queries exclude dismissed alerts, including old records without the field', async (t) => {
  const queries: any[] = [];
  t.mock.method(NotificationModel, 'find', (query: any) => {
    queries.push(query);
    return { sort() { return this; }, limit() { return this; }, lean: async () => [] };
  });
  assert.deepEqual(await notificationService.getNotifications(), []);
  assert.equal(queries.length, 2);
  for (const query of queries) assert.deepEqual(query.dismissed, { $ne: true });
});
test('clear all returns a failure response when storage fails', async (t) => {
  t.mock.method(NotificationModel, 'updateMany', async () => { throw new Error('Storage unavailable'); });
  const res = Object.assign(Object.create(null), { code: 200, status(code: number) { this.code = code; return this; }, json() { return this; } });
  await NotificationController.clearAll(Object.create(null), res);
  assert.equal(res.code, 500);
});
