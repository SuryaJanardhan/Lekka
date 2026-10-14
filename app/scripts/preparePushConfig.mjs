import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../android/app/google-services.json', import.meta.url));
const source = process.env.GOOGLE_SERVICES_JSON;
if (source) {
  const content = existsSync(source) ? readFileSync(source, 'utf8') : source;
  const config = JSON.parse(content);
  if (!config.client?.some((client) => client.client_info?.android_client_info?.package_name === 'com.lekka.app')) {
    throw new Error('Firebase Android configuration must match com.lekka.app');
  }
  writeFileSync(target, content, { mode: 0o600 });
}
if (!existsSync(target)) {
  throw new Error('Remote push needs android/app/google-services.json or the EAS GOOGLE_SERVICES_JSON file environment variable');
}
const config = JSON.parse(readFileSync(target, 'utf8'));
if (!config.client?.some((client) => client.client_info?.android_client_info?.package_name === 'com.lekka.app')) {
  throw new Error('Firebase Android configuration must match com.lekka.app');
}
console.log('Firebase Android push configuration validated');
