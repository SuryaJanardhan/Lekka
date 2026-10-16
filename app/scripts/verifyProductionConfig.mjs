import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const appRoot = resolve(new URL('..', import.meta.url).pathname);
const envFiles = ['.env', '.env.production'];
const forbiddenBackendPattern = /localhost|127\.0\.0\.1|^http:\/\/|100\./i;

function readEnvFile(file) {
  const path = resolve(appRoot, file);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const fileEnvs = Object.fromEntries(envFiles.map((file) => [file, readEnvFile(file)]));
const backendUrl = eas.build?.preview?.env?.VITE_BACKEND_URL || fileEnvs['.env.production'].VITE_BACKEND_URL || '';
const secret = eas.build?.preview?.env?.VITE_LEKKA_API_SECRET || fileEnvs['.env.production'].VITE_LEKKA_API_SECRET || '';

const failures = [];

for (const [file, env] of Object.entries(fileEnvs)) {
  const url = env.VITE_BACKEND_URL || '';
  if (url && forbiddenBackendPattern.test(url)) {
    failures.push(`${file} VITE_BACKEND_URL cannot point to local or private network. Current value: ${url}`);
  }
}

if (!backendUrl.startsWith('https://')) {
  failures.push(`VITE_BACKEND_URL must be an HTTPS production URL. Current value: ${backendUrl || '<empty>'}`);
}

if (forbiddenBackendPattern.test(backendUrl)) {
  failures.push(`VITE_BACKEND_URL cannot point to local or private network. Current value: ${backendUrl}`);
}

if (!secret) {
  failures.push('VITE_LEKKA_API_SECRET is missing.');
}

async function checkEndpoint(path, options = {}) {
  const response = await fetch(`${backendUrl.replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-SECRET': secret,
      ...(options.headers || {})
    }
  });
  return { status: response.status, text: await response.text() };
}

async function checkCorsOrigin(origin) {
  const response = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/categories`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-SECRET': secret,
      Origin: origin
    }
  });
  const allowedOrigin = response.headers.get('access-control-allow-origin');
  if (allowedOrigin !== origin) {
    failures.push(`CORS origin ${origin} is not allowed. Header: ${allowedOrigin || '<missing>'}`);
  }

  const patchPreflight = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/emails/preflight-check`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type,x-api-secret'
    }
  });
  const allowedMethods = patchPreflight.headers.get('access-control-allow-methods') || '';
  if (!patchPreflight.ok || !allowedMethods.split(',').map((method) => method.trim()).includes('PATCH')) {
    failures.push(`CORS origin ${origin} does not allow PATCH. Header: ${allowedMethods || '<missing>'}`);
  }
}

if (failures.length === 0) {
  try {
    const health = await fetch(`${backendUrl.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(8000) });
    if (!health.ok) failures.push(`/health returned ${health.status}`);

    const categories = await checkEndpoint('/api/categories');
    if (categories.status !== 200 || !categories.text.includes('"success"')) {
      failures.push(`/api/categories is not compatible. Status ${categories.status}`);
    }

    const cacheStatus = await checkEndpoint('/api/sync/status');
    const snapshot = await checkEndpoint('/api/sync/snapshot');
    if (cacheStatus.status !== 200 || JSON.parse(cacheStatus.text).data?.schemaVersion !== 1) failures.push('Snapshot revision API is unavailable.');
    const savedData = JSON.parse(snapshot.text).data;
    if (snapshot.status !== 200 || savedData?.schemaVersion !== 1 || !Array.isArray(savedData.entries) || !Array.isArray(savedData.categories) || !savedData.analytics?.summary) failures.push('Complete snapshot API is unavailable.');

    const analytics = await checkEndpoint('/api/analytics');
    if (analytics.status !== 200 || !analytics.text.includes('"summary"')) {
      failures.push(`/api/analytics is not compatible. Status ${analytics.status}`);
    }

    const sync = await checkEndpoint('/api/system/sync-status');
    if (sync.status !== 200 || JSON.parse(sync.text).data?.aiConfigured !== true) {
      failures.push('Production ingestion has no recognized Groq credential.');
    }

    const chat = await checkEndpoint('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'smoke', sessionId: 'prod-config-smoke' })
    });
    if (chat.status !== 200 || !chat.text.includes('"reply"')) {
      failures.push(`/api/chat is not compatible. Status ${chat.status}`);
    }

    await checkCorsOrigin('capacitor://localhost');
    await checkCorsOrigin('https://localhost');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Production backend check failed.');
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(`PASS production backend is compatible: ${backendUrl}`);
