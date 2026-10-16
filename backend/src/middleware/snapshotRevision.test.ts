import test from 'node:test';
import assert from 'node:assert/strict';
import { changesSnapshot, trackSnapshotChanges } from './snapshotRevision';
import { DataRevisionModel } from '../models/DataRevision';

test('only data writes invalidate the app snapshot', () => {
  for (const path of ['/emails/manual', '/emails/id/category', '/emails/id', '/categories', '/categories/id', '/rules/id', '/notifications/clear', '/notifications/id/read']) {
    assert.equal(changesSnapshot('POST', path), true, path);
    assert.equal(changesSnapshot('GET', path), false, path);
  }
  for (const path of ['/chat', '/notifications/devices', '/notifications/devices/phone', '/sync/status']) assert.equal(changesSnapshot('POST', path), false, path);
});

test('a successful write response waits for its revision to be committed', async t => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(DataRevisionModel, 'findByIdAndUpdate', async () => { await gate; return { version: 9 }; });
  const sent: any[] = [];
  const res = Object.assign(Object.create(null), { statusCode: 200, json(body: any) { sent.push(body); return this; } });
  trackSnapshotChanges(Object.assign(Object.create(null), { method: 'POST', path: '/categories' }), res, () => undefined);
  res.json({ success: true, data: { name: 'Food' } });
  assert.equal(sent.length, 0);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].revision, '9');
});
