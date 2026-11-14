import type { DataSnapshot } from './types';
import { decryptJson, encryptJson, isEncryptedPayload } from './localCrypto';

export class SnapshotCache {
  constructor(private key: string) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('lekka-data', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots'); };
      request.onerror = () => reject(request.error || new Error('Local storage unavailable'));
      request.onblocked = () => reject(new Error('Local storage is busy'));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
  }

  async read(): Promise<DataSnapshot | null> {
    const db = await this.open();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const request = tx.objectStore('snapshots').get(this.key);
      tx.oncomplete = () => { db.close(); resolve(request.result || null); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not read saved data')); };
    });
    if (!stored) return null;
    if (isEncryptedPayload(stored)) return decryptJson<DataSnapshot>(stored);
    const legacy = stored as DataSnapshot;
    await this.write(legacy);
    return legacy;
  }

  async write(snapshot: DataSnapshot): Promise<void> {
    const encrypted = await encryptJson(snapshot);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(encrypted, this.key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save local data')); };
    });
  }
}

export interface CacheMetadata {
  dirty?: boolean;
  nextCheckAt?: number;
  pushKeys?: string[];
}

export class SyncMetadata {
  constructor(private key: string) {}
  read(): CacheMetadata {
    try {
      const value = JSON.parse(localStorage.getItem(this.key) || '{}');
      if (!value || typeof value !== 'object') return {};
      return {
        dirty: value.dirty === true,
        nextCheckAt: Number.isFinite(value.nextCheckAt) ? value.nextCheckAt : 0,
        pushKeys: Array.isArray(value.pushKeys) ? value.pushKeys.filter((key: unknown) => typeof key === 'string') : []
      };
    }
    catch { return {}; }
  }
  write(meta: CacheMetadata) { localStorage.setItem(this.key, JSON.stringify(meta)); }
}
