import type { DataSnapshot } from './types';

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
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const request = tx.objectStore('snapshots').get(this.key);
      tx.oncomplete = () => { db.close(); resolve(request.result || null); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not read saved data')); };
    });
  }

  async write(snapshot: DataSnapshot): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(snapshot, this.key);
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
    try { return JSON.parse(localStorage.getItem(this.key) || '{}'); }
    catch { return {}; }
  }
  write(meta: CacheMetadata) { localStorage.setItem(this.key, JSON.stringify(meta)); }
}
