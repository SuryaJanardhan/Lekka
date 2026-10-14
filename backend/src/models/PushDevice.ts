import { Schema, model } from 'mongoose';

const PushDeviceSchema = new Schema({
  installationId: { type: String, required: true, unique: true },
  token: { type: String, required: true, unique: true },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });
export const PushDeviceModel = model('PushDevice', PushDeviceSchema);

const PushDispatchSchema = new Schema({
  key: { type: String, required: true, unique: true },
  state: { type: String, enum: ['sending', 'sent', 'failed'], required: true },
  claimedAt: { type: Date, required: true },
  sentCount: { type: Number, default: 0 }
}, { timestamps: true });
export const PushDispatchModel = model('PushDispatch', PushDispatchSchema);
