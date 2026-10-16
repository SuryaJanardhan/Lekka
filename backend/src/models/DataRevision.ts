import { Schema, model } from 'mongoose';

const schema = new Schema({
  _id: { type: String, required: true },
  version: { type: Number, default: 0 }
}, { timestamps: true });

export const DataRevisionModel = model('DataRevision', schema);
