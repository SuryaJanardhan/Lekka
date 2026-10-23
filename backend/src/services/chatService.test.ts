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
    return { choices: [{ message: { content: 'Complete ledger answer.' } }] };
  } } } });
  const result = await ChatService.processChatMessage({ sessionId: 'parallel-regression', userMessage: 'Show categories and totals' });
  assert.equal(result.reply, 'Complete ledger answer.');
});
