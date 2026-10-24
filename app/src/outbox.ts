import { wireCommand } from './outboxTypes';
import type { LocalOperation, OperationCommand, OperationKind, OperationReceipt } from './outboxTypes';

interface Store {
  list(): Promise<LocalOperation[]>;
  enqueue(kind: OperationKind, targetId: string, payload: Record<string, any>, base?: any): Promise<LocalOperation>;
  update(op: LocalOperation): Promise<void>; remove(id: string): Promise<void>;
}
interface Api {
  submitOperation(command: OperationCommand): Promise<OperationReceipt>;
  operationStatuses(ids: string[]): Promise<OperationReceipt[]>;
  resolveOperation(id: string, action: 'retry' | 'discard', command: OperationCommand): Promise<OperationReceipt>;
}

export class Outbox {
  private pumping = false;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private store: Store, private api: Api, private changed: (operations: LocalOperation[]) => void, private settled: () => Promise<void>, private failed: (message: string) => void) {}
  private async notify() { const rows = await this.store.list(); this.changed(rows); return rows; }
  async start() { this.running = true; await this.notify(); void this.pump(); }
  stop() { this.running = false; clearTimeout(this.timer); }
  async enqueue(kind: OperationKind, targetId: string, payload: Record<string, any>, base?: any) {
    const op = await this.store.enqueue(kind, targetId, payload, base);
    await this.notify(); void this.pump(); return op;
  }
  async reconcile(revision: string) {
    if (!/^\d+$/.test(revision)) return;
    for (const op of await this.store.list()) if (op.state === 'DONE' && op.revision && /^\d+$/.test(op.revision) && BigInt(op.revision) <= BigInt(revision)) await this.store.remove(op.id);
    await this.notify();
  }
  private async receipt(op: LocalOperation, receipt: OperationReceipt) {
    if (receipt.state === 'CANCELLED') { await this.store.remove(op.id); return; }
    await this.store.update({ ...op, accepted: true, state: receipt.state === 'DONE' ? 'DONE' : receipt.state === 'BLOCKED' ? 'BLOCKED' : 'ACCEPTED', result: receipt.result, revision: receipt.revision, error: receipt.error, serverUpdatedAt: receipt.updatedAt, nextAttemptAt: 0 });
  }
  async resolve(id: string, action: 'retry' | 'discard') {
    const op = (await this.store.list()).find(op => op.id === id);
    if (!op || op.state !== 'BLOCKED') return;
    const receipt = await this.api.resolveOperation(id, action, wireCommand(op));
    await this.receipt(op, receipt); await this.notify(); void this.pump();
  }
  async pump() {
    if (!this.running || this.pumping) return;
    this.pumping = true; clearTimeout(this.timer);
    try {
      const rows = await this.store.list();
      for (const op of rows.filter(op => op.state === 'LOCAL')) {
        if (op.nextAttemptAt > Date.now()) break;
        try { await this.receipt(op, await this.api.submitOperation(wireCommand(op))); }
        catch (error: any) {
          const permanent = [400, 409, 422].includes(error.status);
          await this.store.update({ ...op, state: permanent ? 'BLOCKED' : 'LOCAL', error: permanent ? error.message : [401, 403].includes(error.status) ? 'Authentication needs attention. Change remains saved on this device.' : 'Connection interrupted. Will retry safely.', attempts: op.attempts + 1,
            nextAttemptAt: Date.now() + Math.min(300000, 2000 * 2 ** Math.min(op.attempts, 7)) + Math.floor(Math.random() * 1000) });
          break;
        }
      }
      const accepted = (await this.store.list()).filter(op => op.state === 'ACCEPTED');
      for (let offset = 0; offset < accepted.length; offset += 100) {
        const batch = accepted.slice(offset, offset + 100);
        const receipts = await this.api.operationStatuses(batch.map(op => op.id));
        for (const receipt of receipts) { const op = batch.find(op => op.id === receipt.id); if (op) await this.receipt(op, receipt); }
      }
      const current = await this.notify();
      if (current.some(op => op.state === 'DONE')) await this.settled();
    } catch (error: any) { this.failed(error.message || 'Pending changes kept; sync will retry'); }
    finally {
      this.pumping = false;
      if (this.running) {
        try {
          const current = await this.store.list();
          if (current.some(op => op.state !== 'BLOCKED')) this.timer = setTimeout(() => void this.pump(), 5000);
        } catch (error: any) { this.failed(error.message); }
      }
    }
  }
}
