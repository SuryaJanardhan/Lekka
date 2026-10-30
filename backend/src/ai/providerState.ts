import { Schema, model } from 'mongoose';

const schema = new Schema({
  _id: String, calls: { type: Number, default: 0 }, tokens: { type: Number, default: 0 },
  counter: { type: Number, default: 0 }, until: Date, expiresAt: Date,
  inputTokens: Number, outputTokens: Number, remainingTokens: Number, remainingRequests: Number
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AiProviderState = model('AiProviderState', schema);
