import test from 'node:test';
import assert from 'node:assert/strict';
import { LedgerService } from './ledgerService';
import { EmailModel } from '../models/Email';
import { GroqService } from './groqService';

test('notes backfill changes only AI note fields and protects user notes in its write filter', async t => {
  const entry = { _id: 'entry', sender: 'bank', subject: 'Paid', rawTextBody: 'You paid INR 30 to Shop', parsedJson: { detectedAmount: 30 } };
  t.mock.method(EmailModel, 'find', () => ({ sort() { return this; }, limit() { return this; }, lean: async () => [entry] }));
  t.mock.method(GroqService, 'summarizeBatch', async () => new Map([['entry', 'Payment made for daily groceries']]));
  t.mock.method(EmailModel, 'countDocuments', async () => 0);
  let filter: any, update: any;
  t.mock.method(EmailModel, 'updateOne', async (query: any, changes: any) => { filter = query; update = changes; return { modifiedCount: 1 }; });
  const result = await LedgerService.backfillNotes();
  assert.equal(result.updated, 1);
  assert.equal(filter['parsedJson.notesSource'].$ne, 'USER');
  assert.deepEqual(Object.keys(update.$set).sort(), ['parsedJson.notes', 'parsedJson.notesSource']);
});
