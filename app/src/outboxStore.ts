import type { LocalOperation, OperationKind } from './outboxTypes';

export class OutboxStore {
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction('operations', 'readonly'); const request = tx.objectStore('operations').getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result.filter((op: LocalOperation) => op.scope === this.scope).sort((a: LocalOperation, b: LocalOperation) => a.sequence - b.sequence)); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not read pending changes')); };
    });
  }
  async enqueue(kind: OperationKind, targetId: string, payload: Record<string, any>, base?: any): Promise<LocalOperation> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['operations', 'tails'], 'readwrite', { durability: 'strict' });
      const store = tx.objectStore('operations'); const tail = tx.objectStore('tails').get(this.scope); const existing = store.getAll();
      let operation: LocalOperation;
      existing.onsuccess = () => {
        const previous = existing.result.filter((op: LocalOperation) => op.scope === this.scope && op.targetId === targetId).sort((a: LocalOperation, b: LocalOperation) => b.sequence - a.sequence)[0];
        operation = { id: crypto.randomUUID(), scope: this.scope, kind, targetId, payload: structuredClone(payload), base: base ? structuredClone(base) : undefined,
          sequence: (tail.result?.sequence || 0) + 1, state: 'LOCAL', accepted: false, attempts: 0, nextAttemptAt: 0, createdAt: new Date().toISOString(),
          ...(tail.result?.id ? { predecessorId: tail.result.id } : {}),
          ...(previous ? { expectedAfter: previous.id } : base?.updatedAt ? { expectedUpdatedAt: base.updatedAt } : {}) };
        store.add(operation); tx.objectStore('tails').put({ id: operation.id, sequence: operation.sequence }, this.scope);
      };
      tx.oncomplete = () => { db.close(); resolve(operation); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save change on this device. Nothing was queued.')); };
    });
  }
  async update(op: LocalOperation) { await this.change(op.id, op); }
  async remove(id: string) { await this.change(id); }
  private async change(id: string, value?: LocalOperation) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite', { durability: 'strict' }); const store = tx.objectStore('operations');
      if (value) {
        const current = store.get(id);
        current.onsuccess = () => {
          const previous = current.result as LocalOperation | undefined;
          if (!previous) return;
          if (previous.serverUpdatedAt && (!value.serverUpdatedAt || previous.serverUpdatedAt > value.serverUpdatedAt)) return;
          store.put(value);
        };
      } else store.delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not persist pending change status')); };
    });
  }
}
