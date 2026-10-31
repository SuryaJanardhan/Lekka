import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/aiCatalog.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { aiCatalog, skillMention, insertMention } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('catalog exposes five skills and exactly one read-only watch agent', () => {
  assert.equal(aiCatalog.filter(row => row.kind === 'Skill').length, 5);
  assert.deepEqual(aiCatalog.filter(row => row.kind === 'Agent').map(row => row.id), ['watch']);
});
test('mention detection filters at the cursor without treating email addresses as skills', () => {
  assert.equal(skillMention('@sp', 3).query, 'sp');
  assert.equal(skillMention('alerts@axis.bank.in', 18), null);
  assert.equal(skillMention('What @r now?', 7).query, 'r');
  assert.equal(skillMention('', 50), null);
});
test('selection preserves the question and replaces the entire mention word when editing mid-word', () => {
  const draft = 'Show @spending for Food';
  const selected = insertMention(draft, skillMention(draft, 8), 'compare');
  assert.equal(selected.text, 'Show @compare for Food');
  assert.equal(insertMention('Food last month @sp', skillMention('Food last month @sp', 19), 'spending').text, 'Food last month @spending ');
});
