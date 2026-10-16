import test from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { RuleEngine } from './ruleEngine';
import { RuleModel } from '../models/Rule';
import { LedgerService } from './ledgerService';

test('only user confirmation learns a rule and repeated corrections update it', async (t) => {
  const updates: Array<{ query: any; update: any; options: any }> = [];
  t.mock.method(RuleModel, 'findOneAndUpdate', (query: any, update: any, options: any) => {
    updates.push({ query, update, options });
    return Promise.resolve({ ...query, ...update.$set });
  });
  await RuleEngine.autoGenerateRuleFromUserFeedback('Receipt', 'bank@example.com', new Types.ObjectId(), 'Cafe', 'You paid to Cafe');
  await RuleEngine.autoGenerateRuleFromUserFeedback('Receipt', 'bank@example.com', new Types.ObjectId(), 'Cafe', 'You paid to Cafe');
  assert.equal(updates[0].query.learningKey, updates[1].query.learningKey);
  assert.equal(updates[0].options.upsert, true);
  assert.equal(updates[0].update.$set.priority, 20);
  assert.equal(updates[0].update.$set.learnedFrom, 'USER');
  assert.deepEqual(updates[0].update.$set.conditions[0], { field: 'sender', operator: 'equals', value: 'bank@example.com' });
});
test('manual entry creation rejects negative credit amounts before storage', async () => {
  await assert.rejects(() => LedgerService.createManualEntry({ title: 'Credit', amount: -100 }), /positive/);
});
