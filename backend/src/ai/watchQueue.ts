import { operationQueue } from '../services/operationQueue';
import { AiWatchRun } from './watchModels';

const topic = 'lekka-watch';
async function publish(id: string) {
  await operationQueue.send(topic, { id }, { retentionSeconds: 604800 });
  await AiWatchRun.updateOne({ _id: id }, { publishedAt: new Date() });
}
export async function scheduleWatch(now = new Date()) {
  if (!process.env.MONGODB_READONLY_URI) return;
  const id = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  await AiWatchRun.updateOne({ _id: id }, { $setOnInsert: { state: 'PENDING', checkedAt: now } }, { upsert: true });
  const run = await AiWatchRun.findById(id).lean();
  if (run?.state !== 'DONE') await publish(id);
}
export async function recoverWatches() {
  if (!process.env.MONGODB_READONLY_URI) return;
  const runs = await AiWatchRun.find({ state: { $ne: 'DONE' }, $or: [{ publishedAt: { $exists: false } }, { publishedAt: { $lt: new Date(Date.now() - 3600000) } }] }).sort({ createdAt: 1 }).limit(10).lean();
  for (const run of runs) { if (!run._id) continue; try { await publish(run._id); } catch { break; } }
}
