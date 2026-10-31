import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const socket = createServer().listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; socket.close(); await once(socket, 'close');
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-8000); });
let browser;
try {
  const deadline = Date.now() + 20000;
  for (;;) { try { if ((await fetch(origin)).ok) break; } catch {} if (Date.now() > deadline || server.exitCode !== null || server.signalCode !== null) throw Error(logs || 'Test server unavailable'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); const errors = [];
  page.on('pageerror', error => errors.push(error.message)); await page.route('**/api/**', route => route.abort());
  await page.goto(origin); await page.locator('.unlock-keypad').waitFor();
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { ChatComposer } = await import('/src/ChatComposer.tsx'); const { AiReference } = await import('/src/AiReference.tsx');
    document.getElementById('root').style.display = 'none'; const host = document.createElement('div'); document.body.append(host);
    function Fixture() {
      const [value, setValue] = React.useState(''); const [settings, setSettings] = React.useState(false); const ref = React.useRef(null);
      return React.createElement('div', { className: 'phone-shell' },
        React.createElement('button', { onClick: () => setSettings(previous => !previous) }, settings ? 'Open chat fixture' : 'Open settings fixture'),
        settings ? React.createElement('main', { className: 'content' }, React.createElement(AiReference, {
          api: { aiStatus: async () => ({ readReady: false, dailyCalls: 0, keyCount: 2, limits: { dailyCalls: 100, minuteCalls: 5, input: 800, output: 200 } }) },
          onChoose: prefix => { setValue(prefix + value.replace(/^@[a-z]+\s*/i, '')); setSettings(false); }
        })) : React.createElement('main', { className: 'content chat-content' }, React.createElement('section', { className: 'ai-conversation' },
          React.createElement('div', { className: 'conversation-messages' }), React.createElement(ChatComposer, { value, onChange: setValue, onSend: () => { window.sent = value; }, busy: false, inputRef: ref })))
      );
    }
    (client.default || client).createRoot(host).render(React.createElement(Fixture));
  });
  const input = page.getByLabel('Message AI', { exact: true });
  await input.fill('@'); await page.getByRole('listbox').waitFor(); assert.equal(await page.getByRole('option').count(), 6);
  await input.fill('@r'); assert.equal(await page.getByRole('option').count(), 2);
  await input.press('ArrowDown'); await input.press('Enter'); assert.equal((await input.inputValue()).trim(), '@rules'); assert.equal(await page.evaluate(() => window.sent), undefined);
  await input.fill('Food last month @sp'); await page.getByRole('option').filter({ hasText: '@spending' }).tap(); assert.equal(await input.inputValue(), 'Food last month @spending ');
  await input.fill('Show @spending for Food'); await input.press('Home'); for (let i = 0; i < 8; i++) await input.press('ArrowRight');
  assert.equal(await input.evaluate(element => element.selectionStart), 8, 'Caret must enter the existing mention');
  await page.getByRole('option').filter({ hasText: '@spending' }).click({ timeout: 3000 }); assert.equal(await input.inputValue(), 'Show @spending for Food');
  await input.fill('@'); await input.press('Escape'); assert.equal(await page.getByRole('listbox').count(), 0);
  await input.fill('@r'); await input.press('Shift+Tab'); assert.equal(await input.inputValue(), '@r'); assert.equal(await page.getByRole('listbox').count(), 0);
  await input.fill('x'.repeat(241)); assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled(), true);
  await input.fill('@watch'); await input.press('Escape'); await page.getByRole('button', { name: 'Send message', exact: true }).click(); assert.equal(await page.evaluate(() => window.sent), '@watch');
  const screenshots = join(tmpdir(), 'lekka-ai-skills'); await mkdir(screenshots, { recursive: true });
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 320 ? 420 : 844 }); await input.fill(''); await input.fill('@'); await page.getByRole('listbox').waitFor();
    const menu = await page.getByRole('listbox').boundingBox(), composer = await input.boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= width && menu.y >= 0 && menu.y + menu.height <= composer.y);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 390) await page.screenshot({ path: join(screenshots, 'picker-mobile.png') });
    await input.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open settings fixture' }).click(); await page.getByRole('button', { name: 'AI skills & Spending Watch' }).click();
  await page.getByText('Setup needed', { exact: true }).waitFor(); assert.equal(await page.locator('.ai-skill-reference > div').count(), 6);
  await page.screenshot({ path: join(screenshots, 'settings-mobile.png') });
  await page.getByRole('button', { name: '@spending', exact: true }).click(); assert.ok((await input.inputValue()).startsWith('@spending '));
  assert.deepEqual(errors, []); console.log('PASS AI UI: mention filtering, keyboard/touch, draft preservation, small viewport placement, budget validation, and Settings reference.');
  console.log(`Screenshots: ${screenshots}`);
} finally { if (browser) await browser.close(); if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); } }
