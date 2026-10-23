import test from 'node:test';
import assert from 'node:assert/strict';
import { fiveWordNote, notesBackfillQuery } from './transactionNotes';

test('AI notes contain five words without copying an entire email', () => {
  assert.equal(fiveWordNote('**Payment made for daily groceries**'), 'Payment made for daily groceries');
  assert.equal(fiveWordNote('Payment made for daily groceries and other things'), 'Payment made for daily groceries');
  assert.equal(fiveWordNote('Unknown payment'), '');
  assert.equal(fiveWordNote(null), '');
  assert.equal(fiveWordNote(['Salary', 'payment', 'received', 'from', 'ACME']), 'Salary payment received from ACME');
  assert.equal(fiveWordNote(['word1', 'word2', 'word3', 'word4', 'word5']), '');
  assert.equal(notesBackfillQuery()['parsedJson.notesSource'].$ne, 'USER');
});
