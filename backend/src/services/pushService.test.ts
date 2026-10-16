import test from 'node:test';
import assert from 'node:assert/strict';
import { google } from 'googleapis';
import { PushService } from './pushService';
import { PushDeviceModel } from '../models/PushDevice';

test('an unregistered phone is counted as failed, not successful delivery', async (t) => {
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'fixture', client_email: 'fixture@example.com', private_key: 'fixture-only' });
  t.after(() => { if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previous; });
  t.mock.method(PushDeviceModel, 'find', () => ({ lean: async () => [{ _id: 'phone', token: 'fixture-only' }] }));
  const removed = t.mock.method(PushDeviceModel, 'deleteOne', async () => undefined);
  t.mock.method(google.auth.GoogleAuth.prototype, 'getClient', async () => ({ request: async () => {
    throw { response: { data: { error: { details: [{ errorCode: 'UNREGISTERED' }] } } } };
  } }));
  const delivery = await PushService.send('Review', 'Choose a category', 'fixture', 'review');
  assert.deepEqual(delivery, { sent: 0, failed: 1, registered: 1 });
  assert.equal(removed.mock.callCount(), 1);
});
