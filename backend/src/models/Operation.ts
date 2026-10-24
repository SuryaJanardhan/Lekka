import { Schema, model } from 'mongoose';
import { OperationCommand } from '../services/operationCommand';

export interface StoredOperation extends OperationCommand {
  _id: string; hash: string; state: 'PENDING' | 'PROCESSING' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  attempts: number; nextAttemptAt: Date; leaseUntil?: Date; owner?: string; error?: string;
  publishedAt?: Date; result?: any; revision?: string; notificationDue?: boolean; notificationDeliveredTo?: string[]; notificationOwner?: string; notificationLeaseUntil?: Date; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<StoredOperation>({
  _id: String, kind: { type: String, required: true }, targetId: { type: String, required: true }, payload: Schema.Types.Mixed,
  hash: { type: String, required: true }, predecessorId: String, expectedAfter: String, expectedUpdatedAt: String,
  state: { type: String, enum: ['PENDING', 'PROCESSING', 'DONE', 'BLOCKED', 'CANCELLED'], default: 'PENDING' },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: Date, owner: String,
  error: String, publishedAt: Date, result: Schema.Types.Mixed, revision: String, notificationDue: Boolean,
  notificationDeliveredTo: [String], notificationOwner: String, notificationLeaseUntil: Date
}, { timestamps: true });
schema.index({ state: 1, nextAttemptAt: 1, createdAt: 1 });
export const OperationModel = model<StoredOperation>('Operation', schema);
