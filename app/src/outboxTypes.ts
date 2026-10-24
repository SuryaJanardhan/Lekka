import type { EmailRecord, Category, Rule } from './types';
export type OperationKind = 'entry.create' | 'entry.update' | 'entry.delete' | 'entry.category' | 'category.create' | 'category.rename' | 'rule.create' | 'rule.update' | 'rule.delete' | 'notification.read' | 'notification.clear';
export interface OperationCommand {
  id: string; kind: OperationKind; targetId: string; payload: Record<string, any>;
  predecessorId?: string; expectedAfter?: string; expectedUpdatedAt?: string;
}
export interface OperationReceipt { id: string; state: 'PENDING' | 'PROCESSING' | 'DONE' | 'BLOCKED' | 'CANCELLED'; error?: string; result?: any; revision?: string; updatedAt?: string }
export interface LocalOperation extends OperationCommand {
  scope: string; sequence: number; state: 'LOCAL' | 'ACCEPTED' | 'DONE' | 'BLOCKED';
  accepted: boolean; attempts: number; nextAttemptAt: number; createdAt: string;
  base?: EmailRecord | Category | Rule; result?: any; revision?: string; error?: string; serverUpdatedAt?: string;
}
export function entityId() { return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join(''); }
export function wireCommand(op: LocalOperation): OperationCommand {
  return { id: op.id, kind: op.kind, targetId: op.targetId, payload: op.payload,
    ...(op.predecessorId ? { predecessorId: op.predecessorId } : {}), ...(op.expectedAfter ? { expectedAfter: op.expectedAfter } : {}), ...(op.expectedUpdatedAt ? { expectedUpdatedAt: op.expectedUpdatedAt } : {}) };
}
