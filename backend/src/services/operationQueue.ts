import { QueueClient } from '@vercel/queue';
import { OperationModel } from '../models/Operation';

export const operationQueue = new QueueClient();
export const operationTopic = 'lekka-operations';

export async function publishOperation(id: string) {
  await operationQueue.send(operationTopic, { id }, { retentionSeconds: 604800 });
  await OperationModel.updateOne({ _id: id }, { $set: { publishedAt: new Date() } });
}

export async function recoverOperations() {
  const now = new Date();
  const pending = await OperationModel.find({
    $or: [{ state: 'PENDING', nextAttemptAt: { $lte: now } }, { state: 'PROCESSING', leaseUntil: { $lt: now } }],
    $and: [{ $or: [{ publishedAt: { $exists: false } }, { publishedAt: { $lt: new Date(Date.now() - 3600000) } }] }]
  }).sort({ createdAt: 1 }).limit(20).lean();
  for (const op of pending) {
    try { await publishOperation(op._id); }
    catch { console.error('[Operations] Durable change retained; queue publishing will retry'); break; }
  }
}
