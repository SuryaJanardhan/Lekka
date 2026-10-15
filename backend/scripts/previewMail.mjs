import { readFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import dotenv from 'dotenv';

setDefaultResultOrder('ipv4first');
const env = dotenv.parse(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const eas = JSON.parse(readFileSync(new URL('../../app/eas.json', import.meta.url), 'utf8'));
const base = new URL(eas.build.preview.env.VITE_BACKEND_URL);
if (base.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Mail diagnostics must use the production HTTPS backend');
}
if (!env.LEKKA_API_SECRET) throw new Error('LEKKA_API_SECRET is missing from the ignored backend environment');
const response = await fetch(new URL('/api/ingest/preview', base), {
  headers: { 'X-API-SECRET': env.LEKKA_API_SECRET }, signal: AbortSignal.timeout(60000)
});
const result = await response.json();
if (!response.ok || result.success === false) throw new Error(result.error || 'Mail preview failed');
console.log(JSON.stringify(result.data, null, 2));
