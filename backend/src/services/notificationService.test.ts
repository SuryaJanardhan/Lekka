import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationModel } from '../models/Notification';
import { notificationService, NotificationController } from './notificationService';

test('clear all hides alerts and clears reminders without deleting their dedupe metadata', async (t) => {
  let change: any;
  let filter: any;
  t.mock.method(NotificationModel, 'updateMany', async (query: any, update: any) => { filter = query; change = update; return { modifiedCount: 3 }; });
  assert.equal(await notificationService.clearAll(), 3);
  assert.deepEqual(filter, { dismissed: { $ne: true } });
  assert.deepEqual(change, { $set: { read: true, dismissed: true } });
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
