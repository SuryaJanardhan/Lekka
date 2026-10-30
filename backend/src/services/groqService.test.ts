import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqService } from './groqService';
import { AiProvider } from '../ai/provider';

test('batch summaries validate IDs and produce five-word phrases', async t => {
  const key = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test-only';
  t.after(() => { if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key; });
  t.mock.method(AiProvider, 'complete', async () => ({ choices: [{ message: { content: JSON.stringify({ notes: [{ id: 'one', words: ['Salary', 'payment', 'received', 'from', 'ACME'] }, { id: 'other', words: ['Do', 'not', 'update', 'other', 'records'] }] }) } }] }) as any);
  const summaries = await GroqService.summarizeBatch([{ _id: 'one', sender: 'bank', subject: 'Salary', rawTextBody: 'Salary received' }]);
  assert.equal(summaries.size, 1);
  assert.equal(summaries.get('one'), 'Salary payment received from ACME');
});

test('provider extraction failures leave mail eligible for retry instead of claiming its amount is missing', async t => {
  const key = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test-only';
  t.after(() => { if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key; });
  t.mock.method(AiProvider, 'complete', async () => { throw Error('Provider unavailable'); });
  await assert.rejects(() => GroqService.extractFinancialFields('bank', 'Credit', 'INR 100 credited'), /retry on the next sync/);
});
