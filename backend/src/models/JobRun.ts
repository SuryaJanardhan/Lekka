import { Schema, model } from 'mongoose';

const JobRunSchema = new Schema({
  job: { type: String, required: true, index: true },
  source: { type: String, enum: ['VERCEL_CRON', 'MANUAL'], required: true },
  status: { type: String, enum: ['RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED'], required: true },
  startedAt: { type: Date, required: true },
  finishedAt: Date,
  result: Schema.Types.Mixed,
  error: String
}, { timestamps: true });
JobRunSchema.index({ job: 1, startedAt: -1 });
export const JobRunModel = model('JobRun', JobRunSchema);
