import { Schema, model } from 'mongoose';

const SyncDeletionSchema = new Schema({
  _id: { type: String, required: true },
  kind: { type: String, enum: ['entry'], required: true },
  recordId: { type: String, required: true },
  deletedAt: { type: Date, required: true, default: Date.now }
}, { versionKey: false });

SyncDeletionSchema.index({ deletedAt: 1 });

export const SyncDeletionModel = model('SyncDeletion', SyncDeletionSchema);
