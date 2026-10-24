import { createHash } from 'crypto';

export const operationKinds = ['entry.create', 'entry.update', 'entry.delete', 'entry.category', 'category.create', 'category.rename', 'rule.create', 'rule.update', 'rule.delete', 'notification.read', 'notification.clear'] as const;
export type OperationKind = typeof operationKinds[number];
export interface OperationCommand {
  id: string; kind: OperationKind; targetId: string; payload: Record<string, any>;
  predecessorId?: string; expectedAfter?: string; expectedUpdatedAt?: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function operationError(message: string, status = 400) { return Object.assign(new Error(message), { status }); }

export function validateOperation(input: any): OperationCommand {
  if (!input || !uuid.test(input.id) || !operationKinds.includes(input.kind) || !/^[a-f0-9]{24}$/i.test(input.targetId) || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw operationError('Invalid queued operation');
  for (const key of ['predecessorId', 'expectedAfter']) if (input[key] !== undefined && (!uuid.test(input[key]) || input[key] === input.id)) throw operationError('Invalid operation dependency');
  if (input.expectedUpdatedAt !== undefined && (typeof input.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(input.expectedUpdatedAt)))) throw operationError('Invalid record version');
  if (JSON.stringify(input.payload).length > 32000) throw operationError('Queued change is too large');
  if (['entry.update', 'entry.delete', 'entry.category', 'category.rename', 'rule.update', 'rule.delete'].includes(input.kind) && !input.expectedAfter && !input.expectedUpdatedAt) throw operationError('Refresh this record before changing it');
  return { id: input.id, kind: input.kind, targetId: input.targetId, payload: input.payload,
    ...(input.predecessorId ? { predecessorId: input.predecessorId } : {}), ...(input.expectedAfter ? { expectedAfter: input.expectedAfter } : {}),
    ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}) };
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function operationHash(command: OperationCommand) { return createHash('sha256').update(JSON.stringify(canonical(command))).digest('hex'); }
