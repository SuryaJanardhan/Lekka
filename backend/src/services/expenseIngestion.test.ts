import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GmailService } from './gmailService';
import { GroqService } from './groqService';
import { RuleEngine } from './ruleEngine';
import { EmailModel } from '../models/Email';
import { notificationService } from './notificationService';
import { CategoryModel } from '../models/Category';
import { Types } from 'mongoose';

const classify = Reflect.get(GmailService, 'classifyAndStoreEmail').bind(GmailService);
beforeEach(t => { if ('mock' in t) t.mock.method(GroqService, 'summarizeTransaction', async () => 'Payment made for daily needs'); });
function mail(body: string) {
  return { messageId: 'test-only', sender: 'bank@example.com', subject: 'Bank update', rawTextBody: body,
    parsedJson: { detectedAmount: 200 }, receivedAt: new Date(), isTest: true, transportSender: 'bank@example.com' };
}

test('a confirmed credit is stored separately and enters the same category review flow', async (t) => {
  t.mock.method(GroqService, 'extractFinancialFields', async () => ({ transactionDirection: 'CREDIT', detectedAmount: 200 }));
  t.mock.method(RuleEngine, 'evaluateEmail', async () => null);
  t.mock.method(GroqService, 'classifyEmailContent', async () => ({ categoryName: 'Food', confidenceScore: 0.9, reasoning: 'Refund' }));
  t.mock.method(CategoryModel, 'findOne', async () => ({ _id: new Types.ObjectId() }));
  let saved: any;
  t.mock.method(EmailModel, 'create', async (entry: any) => { saved = entry; });
  const result = await classify(mail('INR 200 credited to your account'));
  assert.equal(result.direction, 'CREDIT');
  assert.equal(result.needsUserReview, true);
  assert.equal(saved.parsedJson.transactionDirection, 'CREDIT');
  assert.equal(saved.parsedJson.paymentMode, 'UPI');
  assert.equal(saved.parsedJson.notes.split(/\s+/).length, 5);
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

test('even confident first-time AI suggestions need user review and cannot train rules', async (t) => {
  const id = new Types.ObjectId();
  t.mock.method(RuleEngine, 'evaluateEmail', async () => null);
  t.mock.method(GroqService, 'classifyEmailContent', async () => ({ categoryName: 'Food', confidenceScore: 0.95, reasoning: 'Cafe payment', merchantName: 'Metro Cafe' }));
  t.mock.method(CategoryModel, 'findOne', async () => ({ _id: id }));
  let stored: any;
  t.mock.method(EmailModel, 'create', async (data: any) => { stored = data; });
  const learn = t.mock.method(RuleEngine, 'autoGenerateRuleFromUserFeedback', async () => undefined);
  const result = await classify(mail('You paid INR 200 to Metro Cafe'));
  assert.equal(result.needsUserReview, true);
  assert.equal(stored.reviewStatus, 'PENDING');
  assert.equal(stored.categoryId, id);
  assert.equal(learn.mock.callCount(), 0);
});

test('low-confidence or invented merchants never create automatic rules', async (t) => {
  t.mock.method(RuleEngine, 'evaluateEmail', async () => null);
  t.mock.method(CategoryModel, 'findOne', async () => ({ _id: new Types.ObjectId() }));
  t.mock.method(EmailModel, 'create', async () => undefined);
  const learn = t.mock.method(RuleEngine, 'autoGenerateRuleFromUserFeedback', async () => undefined);
  for (const [confidenceScore, merchantName] of [[0.6, 'Metro Cafe'], [0.95, 'Invented Shop']] as const) {
    t.mock.method(GroqService, 'classifyEmailContent', async () => ({ categoryName: 'Food', confidenceScore, reasoning: 'Test', merchantName }));
    const result = await classify(mail('You paid INR 200 to Metro Cafe'));
    assert.equal(result.needsUserReview, true);
  }
  assert.equal(learn.mock.callCount(), 0);
});

test('an AI category outside the user list is unassigned for review, never created', async (t) => {
  t.mock.method(RuleEngine, 'evaluateEmail', async () => null);
  t.mock.method(GroqService, 'classifyEmailContent', async () => ({ categoryName: 'Old Generic Category', confidenceScore: 0.95, reasoning: 'Test' }));
  t.mock.method(CategoryModel, 'findOne', async () => null);
  t.mock.method(CategoryModel, 'exists', async () => ({ _id: new Types.ObjectId() }));
  let stored: any;
  t.mock.method(EmailModel, 'create', async (data: any) => { stored = data; });
  const result = await classify(mail('You paid INR 200 to Metro Cafe'));
  assert.equal(result.needsUserReview, true);
  assert.equal(stored.categoryId, null);
  assert.equal(stored.categorySource, 'UNASSIGNED');
});

test('saving a first-time review entry requests its native notification', async (t) => {
  t.mock.method(RuleEngine, 'evaluateEmail', async () => null);
  t.mock.method(GroqService, 'classifyEmailContent', async () => ({ categoryName: 'Food', confidenceScore: 0.99, reasoning: 'Test' }));
  t.mock.method(CategoryModel, 'findOne', async () => ({ _id: new Types.ObjectId() }));
  t.mock.method(EmailModel, 'create', async (data: any) => ({ ...data, _id: 'entry' }));
  const notify = t.mock.method(notificationService, 'notifyCategoryReview', async () => undefined);
  await classify(mail('You paid INR 200 to Metro Cafe'));
  assert.equal(notify.mock.callCount(), 1);
  assert.equal(notify.mock.calls[0].arguments[0]?.needsUserReview, true);
});
