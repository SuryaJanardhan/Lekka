import { Schema, model } from 'mongoose';

const ProcessedMailSchema = new Schema({
  messageId: { type: String, required: true, unique: true },
  outcome: { type: String, enum: ['EXPENSE', 'REVIEW'], required: true },
  isTest: { type: Boolean, default: false }
}, { timestamps: true });

export const ProcessedMailModel = model('ProcessedMail', ProcessedMailSchema);
