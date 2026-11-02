import { Schema, model } from 'mongoose';

const schema = new Schema({
  _id: String,
  state: { type: String, enum: ['PENDING', 'PROCESSING', 'DONE'], default: 'PENDING', index: true },
  source: { type: String, enum: ['VERCEL_CRON', 'MANUAL'], required: true },
  batches: { type: Number, default: 0 },
  publishedAt: Date,
  owner: String,
  leaseUntil: Date,
  lastResult: Schema.Types.Mixed,
  error: String,
  completedAt: Date,
  activeKey: String,
  totals: {
    totalProcessed: { type: Number, default: 0 }, newIngested: { type: Number, default: 0 }, duplicatesSkipped: { type: Number, default: 0 },
    needsReviewCount: { type: Number, default: 0 }, notificationOnlyCount: { type: Number, default: 0 }, debitsAdded: { type: Number, default: 0 }, creditsAdded: { type: Number, default: 0 }
  }
}, { timestamps: true });
schema.index({ state: 1, leaseUntil: 1, publishedAt: 1 });
schema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
export const MailIngestionRunModel = model('MailIngestionRun', schema);
