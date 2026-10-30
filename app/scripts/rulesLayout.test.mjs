import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
socket.close(); await once(socket, 'close');
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-8000); });
server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-8000); });
let browser;
try {
  const deadline = Date.now() + 20000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (server.exitCode !== null || server.signalCode !== null || Date.now() > deadline) throw new Error(`Layout test server failed: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => route.abort());
  await page.goto(origin);
  await page.locator('.unlock-keypad').waitFor();
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = client.default || client;
    const { RulesPanel } = await import('/src/RulesPanel.tsx');
    const categories = [{ _id: 'food', name: 'Food' }, { _id: 'travel', name: 'Office Travel' }, { _id: 'long', name: 'LongCategoryName'.repeat(10) }];
    const merchants = ['Samskruti restaurant', 'SNEHA FRESH CHICKEN', 'BBNOW', 'INNOVATIVE RETAIL C', 'CTRLX TECHNOLOGIES', 'FLEXIRIDE SOLUTIONS', 'YARRA NANDINI', 'LongUnbrokenMerchant'.repeat(12)];
    window.layoutRules = merchants.map((value, index) => ({
      _id: `rule-${index}`, categoryId: categories[index === 7 ? 2 : index === 5 ? 1 : 0], priority: 20,
      conditions: [{ field: 'sender', operator: 'equals', value: 'alerts@axis.bank.in' }, { field: 'body', operator: 'contains', value }, { field: 'direction', operator: 'equals', value: 'DEBIT' }]
    }));
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    createRoot(host).render(React.createElement('div', { className: 'phone-shell' }, React.createElement('main', { className: 'content' }, React.createElement(RulesPanel, {
      rules: window.layoutRules, categories,
      onSave: async (payload, id) => { window.layoutSaved = { payload, id }; },
      onDelete: id => { window.layoutDeleted = id; }
    }))));
  });
  await page.locator('.rule-row').first().waitFor();
  const screenshots = join(tmpdir(), 'lekka-rules-layout'); await mkdir(screenshots, { recursive: true });
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    for (const fontSize of [16, 24, 32]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, fontSize);
      await page.locator('.rule-row').nth(3).scrollIntoViewIfNeeded();
      const rows = await page.locator('.rule-row').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return {
          category: element.querySelector('strong').textContent,
          left: rect.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
          right: rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
          buttons: [...element.querySelectorAll('button')].map(button => { const box = button.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height }; })
        };
      }));
      if (width === 390 && fontSize === 16) await page.screenshot({ path: join(screenshots, 'rules-mobile.png') });
      if (width === 320 && fontSize === 32) await page.screenshot({ path: join(screenshots, 'rules-large-text.png') });
      for (const row of rows) for (const button of row.buttons) {
        assert.ok(button.left >= row.left - .5 && button.right <= row.right + .5, `Action outside card at ${width}px / ${fontSize}px: ${JSON.stringify({ row, button })}`);
        assert.ok(button.width >= 39.5 && button.height >= 39.5, `Shrunk action at ${width}px / ${fontSize}px`);
      }
      for (const row of rows) assert.ok(Math.abs(row.buttons[1].right - rows[0].buttons[1].right) <= .5, `Actions misaligned at ${width}px / ${fontSize}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page overflow at ${width}px / ${fontSize}px`);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Edit rule for Food', exact: true }).first().click();
  assert.equal(await page.getByLabel('Rule value 1', { exact: true }).inputValue(), 'alerts@axis.bank.in');
  assert.equal(await page.getByLabel('Rule value 2', { exact: true }).inputValue(), 'Samskruti restaurant');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const saved = await page.evaluate(() => window.layoutSaved);
  assert.equal(saved.id, 'rule-0'); assert.equal(saved.payload.conditions.length, 3); assert.equal(saved.payload.priority, 20);
  await page.getByRole('button', { name: 'Delete rule for Food', exact: true }).first().click();
  assert.equal(await page.evaluate(() => window.layoutDeleted), 'rule-0');
  assert.deepEqual(pageErrors, []);
  console.log('PASS Rules layout: 18 viewport/text-size combinations, long conditions, aligned actions, edit/save/delete.');
  console.log(`Screenshots: ${screenshots}`);
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
}
