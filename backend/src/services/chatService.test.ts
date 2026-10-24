import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from './chatService';

test('all parallel Groq tool calls receive a tool response before the final completion', async t => {
  const previous = Reflect.get(ChatService, 'groqClient');
  const query = Reflect.get(ChatService, 'executeDatabaseQuery');
  Reflect.set(ChatService, 'executeDatabaseQuery', async () => ({ result: 'fixture' }));
  t.after(() => { Reflect.set(ChatService, 'groqClient', previous); Reflect.set(ChatService, 'executeDatabaseQuery', query); });
  const calls = [
    { id: 'categories', type: 'function', function: { name: 'query_database', arguments: '{"queryType":"get_categories"}' } },
    { id: 'totals', type: 'function', function: { name: 'query_database', arguments: '{"queryType":"get_financial_summary"}' } }
  ];
  let count = 0;
  Reflect.set(ChatService, 'groqClient', { chat: { completions: { create: async (request: any) => {
    if (++count === 1) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] };
    assert.deepEqual(request.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.tool_call_id), ['categories', 'totals']);
    assert.equal(request.tool_choice, 'auto');
    assert.equal(request.tools[0].function.name, 'query_database');
    return { choices: [{ message: { content: 'Complete ledger answer.' } }] };
  } } } });
  const result = await ChatService.processChatMessage({ sessionId: 'parallel-regression', userMessage: 'Show categories and totals' });
  assert.equal(result.reply, 'Complete ledger answer.');
});

test('tool markup is never returned as a successful user-facing answer', async t => {
  const previous = Reflect.get(ChatService, 'groqClient');
  t.after(() => Reflect.set(ChatService, 'groqClient', previous));
  Reflect.set(ChatService, 'groqClient', { chat: { completions: { create: async () => ({ choices: [{ message: { content: '<tool_call><function=query_database></function></tool_call>' } }] }) } } });
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'markup-regression', userMessage: 'Show my totals' }), /could not complete/);
});

test('provider failures are errors, not successful fake assistant replies', async t => {
  const previous = Reflect.get(ChatService, 'groqClient');
  t.after(() => Reflect.set(ChatService, 'groqClient', previous));
  Reflect.set(ChatService, 'groqClient', { chat: { completions: { create: async () => { throw { status: 429 }; } } } });
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'rate-limit', userMessage: 'Hello' }), /rate limit/);
});

test('a follow-up database call is executed before answering and repeated calls are bounded', async t => {
  const previous = Reflect.get(ChatService, 'groqClient');
  const query = Reflect.get(ChatService, 'executeDatabaseQuery');
  t.after(() => { Reflect.set(ChatService, 'groqClient', previous); Reflect.set(ChatService, 'executeDatabaseQuery', query); });
  let rounds = 0;
  let executed = 0;
  let repeat = false;
  Reflect.set(ChatService, 'executeDatabaseQuery', async () => { executed++; return { pendingReviews: 3 }; });
  Reflect.set(ChatService, 'groqClient', { chat: { completions: { create: async (request: any) => {
    rounds++;
    assert.equal(request.tools[0].function.name, 'query_database');
    return { choices: [{ message: repeat || rounds < 3 ? { role: 'assistant', content: null, tool_calls: [{ id: `round-${rounds}`, type: 'function', function: { name: 'query_database', arguments: '{"queryType":"get_pending_reviews"}' } }] } : { role: 'assistant', content: 'Three entries need review.' } }] };
  } } } });
  const result = await ChatService.processChatMessage({ sessionId: 'follow-up', userMessage: 'Show totals and reviews' });
  assert.equal(result.reply, 'Three entries need review.');
  assert.equal(executed, 2);
  repeat = true; rounds = 0;
  await assert.rejects(() => ChatService.processChatMessage({ sessionId: 'bounded', userMessage: 'Show reviews' }), /could not complete/);
  assert.equal(rounds, 3);
});
