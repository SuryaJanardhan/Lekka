import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationTitle, privateTransactionConfirmation } from './notificationFormat';
test('notification titles include exactly one type emoji', () => {
  assert.equal(notificationTitle('Review needed', 'REVIEW'), '🔎 Review needed');
  assert.equal(notificationTitle('🔄 Gmail sync complete', 'SYNC'), '🔄 Gmail sync complete');
  assert.equal(notificationTitle('Transaction saved', 'TRANSACTION'), '💸 Transaction saved');
});
test('remote transaction confirmations omit merchant names and amounts', () => {
  assert.equal(privateTransactionConfirmation('DEBIT'), 'Debit saved. Open Lekka to view the details.');
  assert.equal(privateTransactionConfirmation('CREDIT'), 'Credit saved. Open Lekka to view the details.');
});
