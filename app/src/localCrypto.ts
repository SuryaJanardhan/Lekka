import { secureVault } from './secureVault';

export type EncryptedPayload = { version: 1; iv: string; ciphertext: string };
const storageKeyName = 'data.master-key';

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

async function storageKey() {
  let encoded = await secureVault.get(storageKeyName);
  if (!encoded) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    encoded = encode(bytes);
    await secureVault.set(storageKeyName, encoded);
  }
  return crypto.subtle.importKey('raw', Uint8Array.from(decode(encoded)).buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  const row = value as EncryptedPayload;
  return row?.version === 1 && typeof row.iv === 'string' && typeof row.ciphertext === 'string';
}

export async function encryptJson(value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await storageKey(), plaintext);
  return { version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(payload: EncryptedPayload): Promise<T> {
  const iv = Uint8Array.from(decode(payload.iv)).buffer;
  const ciphertext = Uint8Array.from(decode(payload.ciphertext)).buffer;
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await storageKey(), ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
