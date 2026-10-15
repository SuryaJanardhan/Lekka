import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleParser } from 'mailparser';
import { admitMail, chooseUidBatch, exactSenderMatch, MailFilters } from './mailAdmission';
const filters: MailFilters = { selectedSenders: ['noreply@phonepe.com'], trustedForwarders: ['owner@example.com'], testRecipient: 'collector+private-test@example.com' };

test('complete addresses prevent substring sender impersonation', () => {
  assert.equal(exactSenderMatch('attacker+noreply@phonepe.com@evil.example', filters.selectedSenders), false);
  assert.equal(exactSenderMatch('NOREPLY@PHONEPE.COM', filters.selectedSenders), true);
});
test('trusted Gmail forwards retain the bank identity and body despite an old original Date', async () => {
  const mail = await simpleParser('From: Owner <owner@example.com>\r\nTo: collector@example.com\r\nSubject: Fwd: Receipt\r\n\r\n---------- Forwarded message ---------\nFrom: PhonePe <noreply@phonepe.com>\nDate: Tue, 1 Jan 2019 10:00:00 +0530\nSubject: Receipt\nTo: owner@example.com\n\nPaid INR 123.45 at a shop.');
  const result = await admitMail(mail, filters);
  assert.equal(result.accepted, true);
  if (result.accepted) { assert.equal(result.sender, 'noreply@phonepe.com'); assert.match(result.mail.text || '', /123.45/); }
});
test('untrusted quoted bank headers never bypass filters', async () => {
  const mail = await simpleParser('From: stranger@example.com\r\nSubject: Fwd: Receipt\r\n\r\n---------- Forwarded message ---------\nFrom: noreply@phonepe.com\nSubject: Receipt\n\nINR 99');
  assert.equal((await admitMail(mail, filters)).accepted, false);
});
test('test mail requires both the private recipient and subject tag', async () => {
  const tagged = await simpleParser('From: other@example.com\r\nTo: collector+private-test@example.com\r\nSubject: [LEKKA TEST] Invoice\r\n\r\nPaid INR 123.45.');
  const result = await admitMail(tagged, filters);
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.isTest, true);
  const wrong = await simpleParser('From: other@example.com\r\nTo: collector@example.com\r\nSubject: [LEKKA TEST] Invoice\r\n\r\nPaid INR 123.45.');
  const untagged = await simpleParser('From: other@example.com\r\nTo: collector+private-test@example.com\r\nSubject: Invoice\r\n\r\nPaid INR 123.45.');
  assert.equal((await admitMail(wrong, filters)).accepted, false);
  assert.equal((await admitMail(untagged, filters)).accepted, false);
});
test('UID batches resume oldest-first and never replay the star-range last UID', () => {
  assert.deepEqual(chooseUidBatch([90, 102, 101, 105], 2, 100), [101, 102]);
  assert.deepEqual(chooseUidBatch([102, 105], 2, 102), [105]);
  assert.deepEqual(chooseUidBatch([102], 2, 102), []);
  assert.deepEqual(chooseUidBatch([1, 2, 3, 4], 2), [3, 4]);
});

test('BCC test mail can match the actual Delivered-To address', async () => {
  const mail = await simpleParser('From: other@example.com\r\nTo: undisclosed-recipients:;\r\nDelivered-To: collector+private-test@example.com\r\nSubject: [LEKKA TEST] Invoice\r\n\r\nPaid INR 12.');
  assert.equal((await admitMail(mail, filters)).accepted, true);
});

test('trusted RFC822 attachments preserve the original bank message', async () => {
  const mail = await simpleParser('From: owner@example.com\r\nTo: collector@example.com\r\nSubject: Fwd: Receipt\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="forward"\r\n\r\n--forward\r\nContent-Type: text/plain\r\n\r\nAttached receipt\r\n--forward\r\nContent-Type: message/rfc822\r\nContent-Disposition: attachment; filename="receipt.eml"\r\n\r\nFrom: noreply@phonepe.com\r\nTo: owner@example.com\r\nSubject: Bank receipt\r\nMessage-ID: <original-bank-receipt@example.com>\r\n\r\nPaid INR 42.\r\n--forward--\r\n');
  const result = await admitMail(mail, filters);
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.mail.messageId, '<original-bank-receipt@example.com>');
});
