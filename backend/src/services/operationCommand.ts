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
  return { id: input.id, kind: input.kind, targetId: input.targetId, payload: input.payload,
    ...(input.predecessorId ? { predecessorId: input.predecessorId } : {}), ...(input.expectedAfter ? { expectedAfter: input.expectedAfter } : {}),
    ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}) };
}

export function validateOperationPayload(input: OperationCommand) {
  const payload = input.payload;
  if (['entry.create', 'entry.update'].includes(input.kind)) {
    if (typeof payload.title !== 'string' || !payload.title.trim() || !Number.isFinite(payload.amount) || payload.amount <= 0) throw operationError('A title and positive amount are required');
    if (payload.transactionDirection && !['DEBIT', 'CREDIT'].includes(payload.transactionDirection)) throw operationError('Invalid transaction direction');
    if (payload.paymentMode && !['UPI', 'CARD', 'CASH', 'FRIEND_PAID'].includes(payload.paymentMode)) throw operationError('Invalid payment mode');
    if (payload.date && (typeof payload.date !== 'string' || !Number.isFinite(Date.parse(payload.date)))) throw operationError('Invalid transaction date');
  }
  if (['category.create', 'category.rename'].includes(input.kind) && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 80)) throw operationError('Category name must contain 1 to 80 characters');
  if (['entry.update', 'entry.delete', 'entry.category', 'category.rename', 'rule.update', 'rule.delete'].includes(input.kind) && !input.expectedAfter && !input.expectedUpdatedAt) throw operationError('Refresh this record before changing it');
}

function canonical(value: any, depth = 0): any {
  if (depth > 12) throw operationError('Queued change is nested too deeply');
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  return value;
}
export function operationHash(command: OperationCommand) { return createHash('sha256').update(JSON.stringify(canonical(command))).digest('hex'); }
