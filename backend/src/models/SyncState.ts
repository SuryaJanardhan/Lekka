import { Schema, model, Document } from 'mongoose';

export interface ISyncState extends Document {
  key: string;
  lastSuccessfulSyncAt?: Date;
  lastAttemptedSyncAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SyncStateSchema = new Schema<ISyncState>(
  {
    key: { type: String, required: true, unique: true, index: true },
    lastSuccessfulSyncAt: { type: Date },
    lastAttemptedSyncAt: { type: Date },
    lastError: { type: String }
  },
  { timestamps: true }
);

export const SyncStateModel = model<ISyncState>('SyncState', SyncStateSchema);
