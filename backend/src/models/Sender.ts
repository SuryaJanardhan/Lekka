import { Schema, model, Document } from 'mongoose';

export interface ISender extends Document {
  emailAddress: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SenderSchema = new Schema<ISender>(
  {
    emailAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const SenderModel = model<ISender>('Sender', SenderSchema);
