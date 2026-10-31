import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from './chatService';
import { AiProvider } from '../ai/provider';
import { ReadGateway } from '../ai/readGateway';

test('chat routes to bounded read-only skills without sending client snapshots to the provider', async t => {
  let calls = 0;
  t.mock.method(AiProvider, 'complete', async () => { calls++; throw Error('No AI call needed'); });
  t.mock.method(ReadGateway.prototype, 'categories', async () => [{ _id: 'food', name: 'Food' }] as any);
  t.mock.method(ReadGateway.prototype, 'execute', async (request: any) => ({ kind: 'summary', period: request.range, debitPaise: 12500, creditPaise: 0, count: 2 }));
  const response = await ChatService.processChatMessage({ sessionId: 'small', userMessage: '@spending Food this month', clientState: { totals: { month: 999999 }, secret: 'must-not-leak' } });
  assert.match(response.reply, /125.00/); assert.doesNotMatch(response.reply, /999999|must-not-leak/); assert.equal(calls, 0);
});

test('model requests are bounded and never contain the old whole-app context', async t => {
  let captured: any;
  t.mock.method(AiProvider, 'complete', async (request: any) => { captured = request; return { choices: [{ message: { content: 'A short answer.' } }] } as any; });
  const result = await ChatService.processChatMessage({ sessionId: 'general', userMessage: 'What can you do?', clientState: { recentEntries: [{ secret: 'must-not-leak' }] } });
  assert.equal(result.reply, 'A short answer.');
  assert.doesNotMatch(JSON.stringify(captured), /must-not-leak/);
  assert.ok(JSON.stringify(captured.messages).length < 800);
});

test('general provider failures are errors rather than fake successful replies', async t => {
  t.mock.method(AiProvider, 'complete', async () => { throw Object.assign(new Error('AI rate limit reached'), { status: 429 }); });
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'limited', userMessage: 'Tell me something useful' }), /rate limit/);
});

test('a missing read-only credential never falls back to the application write connection', async t => {
  t.mock.method(ReadGateway.prototype, 'categories', async () => { throw Object.assign(new Error('Read-only setup required'), { status: 503 }); });
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'setup', userMessage: '@spending this month' }), /Read-only setup/);
});

test('long user messages are rejected before making model requests', async t => {
  let called = false;
  t.mock.method(AiProvider, 'complete', async () => { called = true; throw Error('No'); });
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'long', userMessage: 'x'.repeat(241) }), /under 240/);
  assert.equal(called, false);
});

test('persisted filters survive repeated page commands and category-only followups', async t => {
  const queries: any[] = [];
  t.mock.method(ReadGateway.prototype, 'categories', async () => [{ name: 'Food' }, { name: 'Travel' }] as any);
  t.mock.method(ReadGateway.prototype, 'execute', async (request: any) => { queries.push(request); return { kind: 'search', records: [], count: 12, period: request.range }; });
  const first = await ChatService.processChatMessage({ sessionId: 'paging', userMessage: '@search "Shop" last month' });
  const second = await ChatService.processChatMessage({ sessionId: 'paging', userMessage: 'next page', context: first.context });
  const third = await ChatService.processChatMessage({ sessionId: 'paging', userMessage: '3', context: second.context });
  assert.equal(third.context?.page, 3); assert.equal(queries[2].term, 'Shop'); assert.equal(queries[2].range.start, queries[0].range.start);
  const food = await ChatService.processChatMessage({ sessionId: 'filters', userMessage: '@spending Food last month' });
  await ChatService.processChatMessage({ sessionId: 'filters', userMessage: 'and Travel', context: food.context });
  assert.equal(queries.at(-1).category, 'Travel'); assert.equal(queries.at(-1).range.start, food.context?.range.start);
});
