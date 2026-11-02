import { randomUUID } from 'crypto';
import { operationQueue } from './operationQueue';
import { MailIngestionRunModel } from '../models/MailIngestionRun';
import { GmailService } from './gmailService';
import { recordJobRun } from './jobRunService';
import { JobRunModel } from '../models/JobRun';
import { notificationService } from './notificationService';
import { bumpDataRevision } from './dataRevisionService';

export const mailIngestionTopic = 'lekka-mail-ingestion';
const retentionSeconds = 604800;

async function publish(id: string) {
  await operationQueue.send(mailIngestionTopic, { id }, { retentionSeconds, idempotencyKey: `mail-ingestion:${id}:${Date.now()}` });
  await MailIngestionRunModel.updateOne({ _id: id }, { $set: { publishedAt: new Date() } });
}

export async function scheduleMailIngestion(source: 'VERCEL_CRON' | 'MANUAL') {
  await JobRunModel.updateMany({ job: 'gmail-ingestion', status: 'RUNNING', startedAt: { $lt: new Date(Date.now() - 10 * 60000) } }, {
    $set: { status: 'FAILED', finishedAt: new Date(), error: 'Function ended before recording completion; replaced by durable small-batch recovery.' }
  });
  const active = await MailIngestionRunModel.findOne({ state: { $ne: 'DONE' } }).sort({ createdAt: 1 }).lean();
  if (active?._id) { await publish(active._id); return { runId: active._id, scheduled: true, resumed: true }; }
  const id = randomUUID();
  try { await MailIngestionRunModel.create({ _id: id, source, state: 'PENDING', activeKey: 'gmail' }); }
  catch (error: any) {
    if (error.code !== 11000) throw error;
    const raced = await MailIngestionRunModel.findOne({ activeKey: 'gmail' }).lean();
    if (!raced?._id) throw error;
    await publish(raced._id); return { runId: raced._id, scheduled: true, resumed: true };
  }
  try { await publish(id); }
  catch (error) {
    console.error('[Ingestion] Run retained; queue publishing will retry');
    throw error;
  }
  return { runId: id, scheduled: true, resumed: false };
}

export async function recoverMailIngestions() {
  const now = new Date();
  const rows = await MailIngestionRunModel.find({ state: { $ne: 'DONE' }, $or: [
    { publishedAt: { $exists: false } }, { publishedAt: { $lt: new Date(now.getTime() - 3600000) } },
    { state: 'PROCESSING', leaseUntil: { $lt: now } }
  ] }).sort({ createdAt: 1 }).limit(5).lean();
  for (const row of rows) { if (!row._id) continue; try { await publish(row._id); } catch { break; } }
}

export async function processMailIngestionRun(id: string) {
  const owner = randomUUID(), now = new Date();
  const run = await MailIngestionRunModel.findOneAndUpdate({ _id: id, state: { $ne: 'DONE' }, $or: [
    { state: 'PENDING' }, { state: 'PROCESSING', leaseUntil: { $lt: now } }
  ] }, { $set: { state: 'PROCESSING', owner, leaseUntil: new Date(now.getTime() + 55000) } }, { new: true }).lean();
  if (!run) return;
  try {
    const result = await recordJobRun('gmail-ingestion', run.source, () => GmailService.processIngestionPipeline(run.source === 'VERCEL_CRON' ? 'automatic' : 'manual', 1, false));
    if (result.newIngested > 0) await bumpDataRevision();
    const hasMore = result.diagnostics?.hasMore === true;
    const updated = await MailIngestionRunModel.findOneAndUpdate({ _id: id, owner, state: 'PROCESSING' }, {
      $set: { lastResult: result },
      $inc: { batches: 1, 'totals.totalProcessed': result.totalProcessed, 'totals.newIngested': result.newIngested, 'totals.duplicatesSkipped': result.duplicatesSkipped,
        'totals.needsReviewCount': result.needsReviewCount, 'totals.notificationOnlyCount': result.notificationOnlyCount,
        'totals.debitsAdded': result.debitsAdded || 0, 'totals.creditsAdded': result.creditsAdded || 0 }
    }, { new: true }).lean();
    if (!updated) throw new Error('Ingestion run lease changed before checkpoint');
    if (!hasMore) {
      const totals: any = updated.totals || {};
      await notificationService.addNotification(
        'Gmail recovery complete',
        `${totals.newIngested || 0} transactions added (${totals.debitsAdded || 0} debits, ${totals.creditsAdded || 0} credits), ${totals.needsReviewCount || 0} need category review, ${totals.notificationOnlyCount || 0} emails need a manual amount check.`,
        'SYNC', { ...totals, source: run.source === 'VERCEL_CRON' ? 'automatic' : 'manual', ingestionRunId: id }
      ).catch(async error => {
        if (error?.code !== 11000) throw error;
      });
    }
    const finalized = await MailIngestionRunModel.updateOne({ _id: id, owner, state: 'PROCESSING' }, {
      $set: { state: hasMore ? 'PENDING' : 'DONE', ...(hasMore ? {} : { completedAt: new Date() }) },
      $unset: { owner: '', leaseUntil: '', error: '', ...(hasMore ? { publishedAt: '' } : { activeKey: '' }) }
    });
    if (finalized.modifiedCount !== 1) throw new Error('Ingestion run lease changed before finalization');
    if (hasMore) await publish(id);
  } catch (error: any) {
    await MailIngestionRunModel.updateOne({ _id: id, owner }, { $set: { state: 'PENDING', error: error.message || 'Batch failed' }, $unset: { owner: '', leaseUntil: '' } });
    throw error;
  }
}
