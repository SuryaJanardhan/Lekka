import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

globalThis.crypto ||= webcrypto;
const vaultModule = `data:text/javascript;base64,${Buffer.from(`let value; export const secureVault = { get: async () => value || null, set: async (_key, next) => { value = next; } };`).toString('base64')}`;
const source = ts.transpileModule(readFileSync(new URL('../src/localCrypto.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText.replace("'./secureVault'", JSON.stringify(vaultModule));
const cryptoModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('large local records round-trip without exposing plaintext or exceeding argument limits', async () => {
  const value = { body: 'private-ledger-data-'.repeat(75_000) };
  const encrypted = await cryptoModule.encryptJson(value);
  assert.equal(JSON.stringify(encrypted).includes('private-ledger-data'), false);
  assert.deepEqual(await cryptoModule.decryptJson(encrypted), value);
});

test('concurrent encryption uses one stable device key', async () => {
  const encrypted = await Promise.all(Array.from({ length: 8 }, (_, index) => cryptoModule.encryptJson({ index })));
  assert.deepEqual(await Promise.all(encrypted.map(cryptoModule.decryptJson)), Array.from({ length: 8 }, (_, index) => ({ index })));
});
