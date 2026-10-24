import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/receiptPreview.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { receiptPreview } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('bank preview keeps amount account time and UPI merchant without the safety footer', () => {
  const preview = receiptPreview("23-10-2026 Dear Customer, Here's the summary of your transaction: Amount Debited: INR 10.00 Account Number: XX9037 Date & Time: 23-10-26, 23:16:21 IST Transaction Info: UPI/P2M/123456/mini Mart If this transaction was not initiated by you: To block UPI: SMS BLOCKUPI. Regards, Axis Bank");
  assert.match(preview, /INR 10.00/);
  assert.match(preview, /XX9037/);
  assert.match(preview, /23:16:21/);
  assert.match(preview, /mini Mart/);
  assert.doesNotMatch(preview, /Customer|BLOCKUPI|Regards/);
  assert.equal(preview.split('\n').length, 4);
});
test('fund preview preserves useful source context and decodes spacing entities', () => {
  const preview = receiptPreview('Dear Customer, Greetings from Axis Mutual Fund! Your SIP investment in Axis Gold Fund has been processed. Folio Number &nbsp;: 123456 Scheme &nbsp;: Axis Gold Fund Plan : Regular Growth Option : Growth SIP Amount (Rs) : 10.00 For security reasons, use your PAN to open the attachment.');
  assert.match(preview, /Axis Gold Fund/);
  assert.doesNotMatch(preview, /&nbsp;|PAN|Dear Customer/);
  assert.equal(preview.split('\n').length, 5);
});
test('plain incoming receipts remain intact while previews stay bounded and empty input stays empty', () => {
  assert.equal(receiptPreview('Your account was credited INR 1000 from Ravi via UPI.'), 'Your account was credited INR 1000 from Ravi via UPI.');
  assert.equal(receiptPreview(''), '');
  assert.equal(receiptPreview('Paid INR 100 to Shop. Regards, Bank support and legal text'), 'Paid INR 100 to Shop.');
  assert.equal(receiptPreview('one\ntwo\nthree\nfour\nfive\nsix').split('\n').length, 5);
  assert.equal(receiptPreview('x'.repeat(2000)).length, 900);
});
