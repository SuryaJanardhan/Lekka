import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqService } from './groqService';
import { groqApiKey } from '../config/groqCredentials';

test('ingestion uses the same numbered production Groq credentials as chat', (t) => {
  const names = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2'];
  const original = names.map(name => process.env[name]);
  const cached = Reflect.get(GroqService, 'groqClient');
  t.after(() => {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
    Reflect.set(GroqService, 'groqClient', cached);
  });
  for (const keyName of names) {
    names.forEach(name => delete process.env[name]);
    process.env[keyName] = 'credential-fixture-only';
    Reflect.set(GroqService, 'groqClient', null);
    const client = Reflect.get(GroqService, 'getClient').call(GroqService);
    assert.ok(client, `Ingestion must accept ${keyName}`);
    assert.equal(client.apiKey, 'credential-fixture-only');
  }
  process.env.GROQ_API_KEY = '   ';
  process.env.GROQ_API_KEY_1 = ' production-key-fixture ';
  assert.equal(groqApiKey(), 'production-key-fixture');
});
