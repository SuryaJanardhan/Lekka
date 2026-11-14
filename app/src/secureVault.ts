import { Capacitor, registerPlugin } from '@capacitor/core';

type VaultPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

const nativeVault = registerPlugin<VaultPlugin>('SecureVault');
const webPrefix = 'lekka_preview_vault:';

export const secureVault = {
  async get(key: string) {
    if (Capacitor.isNativePlatform()) return (await nativeVault.get({ key })).value;
    return localStorage.getItem(webPrefix + key);
  },
  async set(key: string, value: string) {
    if (Capacitor.isNativePlatform()) return nativeVault.set({ key, value });
    localStorage.setItem(webPrefix + key, value);
  },
  async remove(key: string) {
    if (Capacitor.isNativePlatform()) return nativeVault.remove({ key });
    localStorage.removeItem(webPrefix + key);
  }
};
