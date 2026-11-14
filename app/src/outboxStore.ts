import type { LocalOperation, OperationKind } from './outboxTypes';
import { decryptJson, EncryptedPayload, encryptJson, isEncryptedPayload } from './localCrypto';

type StoredOperation = Omit<LocalOperation, 'payload' | 'base' | 'result' | 'error'> & {
  secure?: EncryptedPayload;
  payload?: Record<string, any>;
  base?: LocalOperation['base'];
  result?: any;
  error?: string;
};

async function seal(operation: LocalOperation): Promise<StoredOperation> {
  const { payload, base, result, error, ...metadata } = operation;
  return { ...metadata, secure: await encryptJson({ payload, base, result, error }) };
}

async function unseal(operation: StoredOperation): Promise<LocalOperation> {
  if (!isEncryptedPayload(operation.secure)) return operation as LocalOperation;
  const sensitive = await decryptJson<Pick<LocalOperation, 'payload' | 'base' | 'result' | 'error'>>(operation.secure);
  const { secure: _secure, ...metadata } = operation;
  return { ...metadata, ...sensitive } as LocalOperation;
}

export class OutboxStore {
  private mutation = Promise.resolve();
  constructor(private scope: string) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('lekka-outbox', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('operations', { keyPath: 'id' }); request.result.createObjectStore('tails'); };
      request.onerror = () => reject(request.error || new Error('Outbox storage unavailable'));
      request.onblocked = () => reject(new Error('Close the other Lekka window and retry saving'));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
  }
  async list(): Promise<LocalOperation[]> {
    const db = await this.open();
    const stored = await new Promise<StoredOperation[]>((resolve, reject) => {
      const tx = db.transaction('operations', 'readonly'); const request = tx.objectStore('operations').getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result.filter((op: StoredOperation) => op.scope === this.scope).sort((a: StoredOperation, b: StoredOperation) => a.sequence - b.sequence)); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not read pending changes')); };
    });
    const operations = await Promise.all(stored.map(unseal));
    const legacy = operations.filter((_, index) => !isEncryptedPayload(stored[index].secure));
    if (legacy.length) await Promise.all(legacy.map(operation => this.write(operation)));
    return operations;
  }
  async enqueue(kind: OperationKind, targetId: string, payload: Record<string, any>, base?: any): Promise<LocalOperation> {
    return this.exclusive(async () => {
      const existing = await this.list();
      const tail = await this.readTail();
      const previous = existing.filter(op => op.targetId === targetId &&
        (op.state !== 'DONE' || !base?.updatedAt || op.result?.updatedAt === base.updatedAt)).sort((a, b) => b.sequence - a.sequence)[0];
      const operation: LocalOperation = { id: crypto.randomUUID(), scope: this.scope, kind, targetId, payload: structuredClone(payload), base: base ? structuredClone(base) : undefined,
        sequence: (tail?.sequence || 0) + 1, state: 'LOCAL', accepted: false, attempts: 0, nextAttemptAt: 0, createdAt: new Date().toISOString(),
        ...(tail?.id ? { predecessorId: tail.id } : {}),
        ...(previous ? { expectedAfter: previous.id } : base?.updatedAt ? { expectedUpdatedAt: base.updatedAt } : {}) };
      const stored = await seal(operation);
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['operations', 'tails'], 'readwrite', { durability: 'strict' });
        tx.objectStore('operations').add(stored);
        tx.objectStore('tails').put({ id: operation.id, sequence: operation.sequence }, this.scope);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save change on this device. Nothing was queued.')); };
      });
      return operation;
    });
  }
  async update(op: LocalOperation) { await this.change(op.id, op); }
  async remove(id: string) { await this.change(id); }
  private async readTail(): Promise<{ id: string; sequence: number } | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tails', 'readonly'); const request = tx.objectStore('tails').get(this.scope);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not read pending change order')); };
    });
  }
  private async write(value: LocalOperation) {
    const stored = await seal(value); const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite', { durability: 'strict' }); tx.objectStore('operations').put(stored);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not encrypt pending change')); };
    });
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (navigator.locks) return navigator.locks.request(`lekka-outbox:${this.scope}`, async () => await action()) as unknown as Promise<T>;
    const result = this.mutation.then(action, action);
    this.mutation = result.then(() => undefined, () => undefined);
    return result;
  }
  private async change(id: string, value?: LocalOperation) {
    const encrypted = value ? await seal(value) : undefined;
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite', { durability: 'strict' }); const store = tx.objectStore('operations');
      if (value) {
        const current = store.get(id);
        current.onsuccess = () => {
          const previous = current.result as LocalOperation | undefined;
          if (!previous) return;
          if (previous.serverUpdatedAt && (!value.serverUpdatedAt || previous.serverUpdatedAt > value.serverUpdatedAt)) return;
          store.put(encrypted!);
        };
      } else store.delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not persist pending change status')); };
    });
  }
}
