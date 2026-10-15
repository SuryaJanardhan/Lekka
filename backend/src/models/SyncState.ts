import { Schema, model, Document } from 'mongoose';

export interface ISyncState extends Document {
  key: string;
  lastSuccessfulSyncAt?: Date;
  lastAttemptedSyncAt?: Date;
  lastError?: string;
  imapCursor?: { key: string; lastUid: number };
  ingestionLockToken?: string;
  ingestionLockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SyncStateSchema = new Schema<ISyncState>(
  {
    key: { type: String, required: true, unique: true, index: true },
    lastSuccessfulSyncAt: { type: Date },
    lastAttemptedSyncAt: { type: Date },
    lastError: { type: String },
    imapCursor: { type: Schema.Types.Mixed },
    ingestionLockToken: { type: String },
    ingestionLockUntil: { type: Date }
  },
  { timestamps: true }
);

export const SyncStateModel = model<ISyncState>('SyncState', SyncStateSchema);
