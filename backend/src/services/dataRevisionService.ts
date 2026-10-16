import { DataRevisionModel } from '../models/DataRevision';

export async function dataRevision(): Promise<string> {
  const row = await DataRevisionModel.findById('app').lean();
  return String(row?.version || 0);
}

export async function bumpDataRevision(): Promise<string> {
  const row = await DataRevisionModel.findByIdAndUpdate('app', { $inc: { version: 1 } }, { upsert: true, new: true });
  return String(row!.version);
}
