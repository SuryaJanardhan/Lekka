import test from 'node:test';
import assert from 'node:assert/strict';
import { changesSnapshot } from './snapshotRevision';

test('only data writes invalidate the app snapshot', () => {
  for (const path of ['/emails/manual', '/emails/id/category', '/emails/id', '/categories', '/categories/id', '/rules/id', '/notifications/clear', '/notifications/id/read']) {
    assert.equal(changesSnapshot('POST', path), true, path);
    assert.equal(changesSnapshot('GET', path), false, path);
  }
  for (const path of ['/chat', '/notifications/devices', '/notifications/devices/phone', '/sync/status']) assert.equal(changesSnapshot('POST', path), false, path);
});
