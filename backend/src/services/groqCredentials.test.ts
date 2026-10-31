import test from 'node:test';
import assert from 'node:assert/strict';
import { groqApiKey, groqApiKeys } from '../config/groqCredentials';

test('ingestion uses the same numbered production Groq credentials as chat', (t) => {
  const names = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2'];
  const original = names.map(name => process.env[name]);
  t.after(() => {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  });
  for (const keyName of names) {
    names.forEach(name => delete process.env[name]);
    process.env[keyName] = 'credential-fixture-only';
    assert.deepEqual(groqApiKeys(), ['credential-fixture-only'], `Shared pool must accept ${keyName}`);
  }
  process.env.GROQ_API_KEY = '   ';
  process.env.GROQ_API_KEY_1 = ' production-key-fixture ';
  assert.equal(groqApiKey(), 'production-key-fixture');
  process.env.GROQ_API_KEY_2 = 'production-key-fixture';
  assert.deepEqual(groqApiKeys(), ['production-key-fixture']);
});
