import { Schema, model } from 'mongoose';

const runSchema = new Schema({
  _id: String, state: { type: String, default: 'PENDING' }, checkedAt: Date, publishedAt: Date,
  owner: String, leaseUntil: Date, findings: { type: Schema.Types.Mixed, default: undefined },
  reply: String, notifiedTo: [String], error: String, completedThrough: Date, processedIds: [String], partial: Boolean
}, { timestamps: true });
runSchema.index({ state: 1, leaseUntil: 1 });
export const AiWatchRun = model('AiWatchRun', runSchema);
export const AiWatchFinding = model('AiWatchFinding', new Schema({ _id: String, runId: String }, { timestamps: true }));
