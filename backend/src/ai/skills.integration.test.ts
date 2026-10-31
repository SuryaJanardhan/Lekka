import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoClient, ObjectId } from 'mongodb';
import { Completions } from 'groq-sdk/resources/chat/completions';
import { ReadGateway } from './readGateway';
import { aiReadDatabase, closeAiReadConnection } from './readConnection';
import { AiProvider, AI_LIMITS } from './provider';
import { AiProviderState, AiResponseCache } from './providerState';
import { SkillService } from './skillService';
import { AiWatchRun, AiWatchFinding } from './watchModels';
import { processWatch } from './watchService';
import { NotificationModel } from '../models/Notification';

const uri = process.env.AI_TEST_URI;
const integration = uri ? test : test.skip;
let root: MongoClient;
const original = { reader: process.env.MONGODB_READONLY_URI, keys: ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2'].map(name => process.env[name]) };
const reader = 'mongodb://lekka_reader:isolated-reader-only@127.0.0.1:27130/lekka_ai_test?authSource=admin&replicaSet=lekka-ai-test';
before(async () => {
  if (!uri) return;
  const parsed = new URL(uri);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27130' || parsed.pathname !== '/lekka_ai_test') throw Error('AI tests require the isolated authorization-enabled test database');
  root = await new MongoClient(uri).connect();
  await root.db().dropDatabase();
  try { await root.db('admin').command({ dropUser: 'lekka_reader' }); } catch {}
  await root.db('admin').command({ createUser: 'lekka_reader', pwd: 'isolated-reader-only', roles: [{ role: 'read', db: 'lekka_ai_test' }] });
  process.env.MONGODB_READONLY_URI = reader;
  await mongoose.connect(uri);
  for (const model of [AiProviderState, AiResponseCache, AiWatchRun, AiWatchFinding, NotificationModel]) await model.init();
  const food = new ObjectId(), travel = new ObjectId();
  await root.db().collection('categories').insertMany([{ _id: food, name: 'Food' }, { _id: travel, name: 'Travel' }]);
  await root.db().collection('emails').insertMany([
    { subject: 'Old', categoryId: food, receivedAt: new Date('2026-09-30T18:29:59Z'), parsedJson: { detectedAmount: 50 } },
    { subject: 'Boundary', categoryId: food, receivedAt: new Date('2026-09-30T18:30:00Z'), parsedJson: { detectedAmount: 100 } },
    { subject: 'Refund', categoryId: food, receivedAt: new Date('2026-10-10'), parsedJson: { detectedAmount: 300, transactionDirection: 'CREDIT' } },
    { subject: 'Legacy', categoryId: food, receivedAt: new Date('2026-10-11'), parsedJson: { detectedAmount: 50.25 }, needsUserReview: true },
    { subject: 'Travel', categoryId: travel, receivedAt: new Date('2026-10-20'), parsedJson: { detectedAmount: 200 } },
    { subject: 'Literal .* receipt', categoryId: food, receivedAt: new Date('2026-10-29'), rawTextBody: 'private receipt body', parsedJson: { detectedAmount: 20 } },
    { subject: 'Next month', categoryId: food, receivedAt: new Date('2026-10-31T18:30:00Z'), parsedJson: { detectedAmount: 999 } }
  ].map((row, index) => ({ ...row, messageId: `ai-fixture-${index}` })));
});
beforeEach(async () => { if (uri) { await AiProviderState.deleteMany({}); await AiResponseCache.deleteMany({}); process.env.GROQ_API_KEY = 'test-key-a'; process.env.GROQ_API_KEY_1 = 'test-key-a'; process.env.GROQ_API_KEY_2 = 'test-key-b'; } });
after(async () => {
  if (uri) { await closeAiReadConnection(); await mongoose.disconnect(); await root.db().dropDatabase(); await root.close(); }
  if (original.reader === undefined) delete process.env.MONGODB_READONLY_URI; else process.env.MONGODB_READONLY_URI = original.reader;
  ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2'].forEach((name, i) => { if (original.keys[i] === undefined) delete process.env[name]; else process.env[name] = original.keys[i]; });
});
const request = { skill: 'spending' as const, range: { start: '2026-09-30T18:30:00Z', end: '2026-10-31T18:30:00Z', label: 'October 2026' }, category: 'Food', direction: 'BOTH' as const, page: 1 };

integration('database credential itself denies writes and gateway totals are category/direction/IST correct', async () => {
  const db = await aiReadDatabase();
  await assert.rejects(() => db.collection('emails').insertOne({ subject: 'MUST NOT WRITE' }), (error: any) => error.code === 13);
  const result: any = await new ReadGateway().execute(request);
  assert.equal(result.debitPaise, 17025); assert.equal(result.creditPaise, 30000); assert.equal(result.count, 4);
  await closeAiReadConnection(); process.env.MONGODB_READONLY_URI = uri;
  await assert.rejects(() => aiReadDatabase(), /not strictly read-only/);
  process.env.MONGODB_READONLY_URI = reader;
});
integration('literal searches cannot inject regex and returned records exclude receipt bodies', async () => {
  const result: any = await new ReadGateway().execute({ ...request, skill: 'search', term: '.*' });
  assert.equal(result.count, 1); assert.equal(result.records[0].title, 'Literal .* receipt');
  assert.equal(result.records[0].rawTextBody, undefined);
});
integration('explicit financial skills use no provider calls and ignore pending client snapshots', async t => {
  t.mock.method(AiProvider, 'complete', async () => { throw Error('Must not call model for totals'); });
  const result = await SkillService.respond('@spending Food October 2026');
  assert.match(result.reply, /170\.25/); assert.equal(result.aiCalls, 0);
});
integration('distinct-key rotation is persistent and cached requests spend no extra budget', async t => {
  const keys: string[] = [];
  t.mock.method(Completions.prototype, 'create', function(this: any, _input: any) {
    keys.push(Reflect.get(this, '_client').apiKey);
    return { withResponse: async () => ({ data: { choices: [{ message: { content: 'A short answer.' } }], usage: { prompt_tokens: 20, completion_tokens: 5 } }, response: new Response('', { headers: { 'x-ratelimit-remaining-tokens': '6000' } }) }) } as any;
  });
  for (const message of ['one', 'two', 'three', 'three']) await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: message }] });
  assert.deepEqual(keys, ['test-key-a', 'test-key-b', 'test-key-a']);
  const state = await AiProvider.status(); assert.equal(state.dailyCalls, 3); assert.equal(state.keyCount, 2);
});
integration('minute exhaustion rolls back daily reservations and 429 cooldown prevents key hammering', async t => {
  let calls = 0;
  t.mock.method(Completions.prototype, 'create', function() {
    calls++; return { withResponse: async () => ({ data: { choices: [{ message: { content: 'OK' } }] }, response: new Response('') }) } as any;
  });
  for (let i = 0; i < AI_LIMITS.minuteCalls; i++) await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: String(i) }] });
  await assert.rejects(() => AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'six' }] }), /budget is busy/);
  assert.equal((await AiProvider.status()).dailyCalls, 5); assert.equal(calls, 5);
  await AiProviderState.deleteMany({}); await AiResponseCache.deleteMany({});
  t.mock.method(Completions.prototype, 'create', function() { calls++; return { withResponse: async () => { throw { status: 429, headers: { 'retry-after': '30' } }; } } as any; });
  await assert.rejects(() => AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'cooldown' }] }), /cooling down/);
  await assert.rejects(() => AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'cooldown again' }] }), /cooling down/);
  assert.equal(calls, 6);
});

integration('watch without findings consumes no AI request and retries do not duplicate grouped alerts', async t => {
  let calls = 0;
  t.mock.method(AiProvider, 'complete', async () => { calls++; throw Error('Budget unavailable; retain calculated findings'); });
  const now = new Date();
  await AiWatchRun.create({ _id: 'watch-empty', checkedAt: now });
  await processWatch('watch-empty'); assert.equal(calls, 0);
  assert.equal(await NotificationModel.countDocuments({ 'metadata.watchRunId': 'watch-empty' }), 0);
  await root.db().collection('emails').insertMany([1, 2].map(index => ({ messageId: `watch-fixture-${index}`, subject: 'Same merchant', receivedAt: new Date(now.getTime() - index * 60000), processedAt: new Date(now.getTime() - 100), parsedJson: { merchantName: 'Same merchant', detectedAmount: 120, transactionDirection: 'DEBIT' } })));
  await AiWatchRun.create({ _id: 'watch-flagged', checkedAt: now });
  await processWatch('watch-flagged'); await processWatch('watch-flagged');
  assert.equal((await AiWatchRun.findById('watch-flagged'))?.state, 'DONE');
  assert.equal(await NotificationModel.countDocuments({ 'metadata.watchRunId': 'watch-flagged' }), 1);
  await AiWatchRun.create({ _id: 'watch-repeated', checkedAt: now }); await processWatch('watch-repeated');
  assert.equal(await NotificationModel.countDocuments({ type: 'REMINDER' }), 1);
});

integration('cooling keys and oversized email context do not consume another reservation', async t => {
  let calls = 0;
  t.mock.method(Completions.prototype, 'create', function() { calls++; return { withResponse: async () => { throw { status: 401 }; } } as any; });
  const params = { model: 'qwen/qwen3.8-27b', messages: [{ role: 'user' as const, content: 'hello' }] };
  await assert.rejects(() => AiProvider.complete(params), /cooling down/);
  assert.equal(calls, 2); const before = (await AiProvider.status()).dailyCalls;
  await assert.rejects(() => AiProvider.complete({ ...params, messages: [{ role: 'user', content: 'another' }] }), /No request was reserved/);
  assert.equal((await AiProvider.status()).dailyCalls, before); assert.equal(calls, 2);
  await assert.rejects(() => AiProvider.complete({ ...params, messages: [{ role: 'user', content: 'x'.repeat(7000) }] }, 'email'), (error: any) => error.status === 413);
  assert.equal((await AiProvider.status()).dailyCalls, before); assert.equal(calls, 2);
});
