import test from 'node:test';
import assert from 'node:assert/strict';
import { GmailService } from './gmailService';
import { GroqService } from './groqService';
import { RuleEngine } from './ruleEngine';
import { EmailModel } from '../models/Email';
import { notificationService } from './notificationService';

const classify = Reflect.get(GmailService, 'classifyAndStoreEmail').bind(GmailService);
function mail(body: string) {
  return { messageId: 'test-only', sender: 'bank@example.com', subject: 'Bank update', rawTextBody: body,
    parsedJson: { detectedAmount: 200 }, receivedAt: new Date(), isTest: true, transportSender: 'bank@example.com' };
}

test('credit with a parsed amount never creates an expense or calls AI', async (t) => {
  const ai = t.mock.method(GroqService, 'extractFinancialFields', async () => { throw new Error('Unexpected AI'); });
  const store = t.mock.method(EmailModel, 'create', async () => { throw new Error('Unexpected expense'); });
  const result = await classify(mail('INR 200 credited to your account'));
  assert.equal(result.ignoredCredit, true);
  assert.equal(ai.mock.callCount(), 0);
  assert.equal(store.mock.callCount(), 0);
});
test('unpaid invoice amount goes to review when AI cannot confirm a debit', async (t) => {
  t.mock.method(GroqService, 'extractFinancialFields', async () => null);
  const notice = t.mock.method(notificationService, 'addNotification', async () => undefined);
  const store = t.mock.method(EmailModel, 'create', async () => { throw new Error('Unexpected expense'); });
  const result = await classify(mail('Invoice INR 200 due tomorrow'));
  assert.equal(result.notificationOnly, true);
  assert.equal(notice.mock.callCount(), 1);
  assert.equal(store.mock.callCount(), 0);
});
test('existing category rule handles a completed debit without classification AI', async (t) => {
  t.mock.method(RuleEngine, 'evaluateEmail', async () => 'category-id');
  let stored: Record<string, any> | undefined;
  const store = t.mock.method(EmailModel, 'create', async (data: Record<string, any>) => { stored = data; });
  const ai = t.mock.method(GroqService, 'classifyEmailContent', async () => { throw new Error('Unexpected AI'); });
  const result = await classify(mail('You paid INR 200 to Shop'));
  assert.equal(result.notificationOnly, false);
  assert.equal(store.mock.callCount(), 1);
  assert.equal(ai.mock.callCount(), 0);
  assert.equal(stored?.parsedJson.transactionDirection, 'DEBIT');
});
