import { secureVault } from './secureVault';

type PinCredential = { version: 1; iterations: number; salt: string; hash: string };
const credentialKey = 'pin.credential';
const pepperKey = 'pin.pepper';
const iterations = 210_000;

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

async function pepper() {
  const existing = await secureVault.get(pepperKey);
  if (existing) return existing;
  const value = encode(random(32));
  await secureVault.set(pepperKey, value);
  return value;
}

async function derive(pin: string, salt: Uint8Array, rounds: number) {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${pin}:${await pepper()}`), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = Uint8Array.from(salt).buffer;
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: rounds }, secret, 256));
}

async function createCredential(pin: string): Promise<PinCredential> {
  const salt = random(16);
  return { version: 1, iterations, salt: encode(salt), hash: encode(await derive(pin, salt, iterations)) };
}

export async function initializePinCredential() {
  if (await secureVault.get(credentialKey)) return;
  const legacy = localStorage.getItem('lekka_app_pin');
  await secureVault.set(credentialKey, JSON.stringify(await createCredential(/^\d{4}$/.test(legacy || '') ? legacy! : '1234')));
  localStorage.removeItem('lekka_app_pin');
}

export async function verifyPin(pin: string) {
  const raw = await secureVault.get(credentialKey);
  if (!raw) return false;
  const credential = JSON.parse(raw) as PinCredential;
  if (credential.version !== 1 || !/^\d{4}$/.test(pin)) return false;
  const actual = await derive(pin, decode(credential.salt), credential.iterations);
  const expected = decode(credential.hash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export async function replacePin(current: string, next: string) {
  if (!await verifyPin(current)) return false;
  await secureVault.set(credentialKey, JSON.stringify(await createCredential(next)));
  return true;
}
