import { randomUUID, createHash } from 'crypto';
import { ReadGateway } from './readGateway';
import { detectWatchFindings, WatchFinding } from './watchDetection';
import { AiWatchRun, AiWatchFinding } from './watchModels';
import { AiProvider, inputUpperBound } from './provider';
import { NotificationModel } from '../models/Notification';
import { PushService } from '../services/pushService';
import { bumpDataRevision } from '../services/dataRevisionService';

export async function processWatch(id: string) {
  const existing = await AiWatchRun.findById(id).lean();
  if (!existing || existing.state === 'DONE') return;
  const owner = randomUUID();
  const run = await AiWatchRun.findOneAndUpdate({ _id: id, state: { $ne: 'DONE' }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { owner, leaseUntil: new Date(Date.now() + 90000), state: 'PROCESSING' } }, { new: true }).lean();
  if (!run) throw Error('Watch check already processing');
  try {
    if (!run.checkedAt || (Date.now() - run.checkedAt.getTime() > 48 * 3600000 && !run.findings)) {
      await AiWatchFinding.deleteMany({ runId: id });
      await AiWatchRun.updateOne({ _id: id, owner }, { state: 'DONE', findings: [], reply: 'Skipped stale watch check' }); return;
    }
    let findings: WatchFinding[] = run.findings;
    let reply = run.reply || '';
    if (!findings) {
      const previous = await AiWatchRun.findOne({ _id: { $ne: id }, state: 'DONE', completedThrough: { $lte: run.checkedAt } }).sort({ completedThrough: -1 }).lean();
      const from = previous?.completedThrough ? new Date(previous.completedThrough.getTime() - (previous.partial ? 0 : 600000)) : new Date(0);
      const data = await new ReadGateway().watchData(run.checkedAt, from, previous?.processedIds || []);
      findings = [];
      const candidates = detectWatchFindings(data, 500);
      const claimed = await AiWatchFinding.find({ _id: { $in: candidates.map(row => row.id) }, runId: { $ne: id } }).select('_id').lean();
      const claimedIds = new Set(claimed.map(row => row._id));
      for (const finding of candidates.filter(row => !claimedIds.has(row.id))) {
        if (findings.length >= 3) break;
        const saved = await AiWatchFinding.findOneAndUpdate({ _id: finding.id }, { $setOnInsert: { runId: id } }, { upsert: true, new: true }).lean();
        if (saved?.runId === id) findings.push(finding);
      }
      reply = findings.map(row => row.message).join('\n');
      if (findings.length) {
        const messages: any[] = [{ role: 'system', content: 'Summarize these possible spending issues in plain text. Never state fraud or duplication as proven. Do not invent facts or suggest automatic edits.' }, { role: 'user', content: reply }];
        if (inputUpperBound(messages) <= 800) {
          try { const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, ...{ reasoning_effort: 'none' } }, 'watch'); const explanation = response.choices[0]?.message?.content; if (explanation) reply += '\n' + explanation; } catch {}
        }
        if (data.truncated) reply += '\nCoverage: 200 newly processed debit records; backlog remains for a later check.';
      }
      const boundaryIds = data.truncated ? data.recent.filter(row => new Date(row.processedAt).getTime() === data.coveredThrough.getTime()).map(row => String(row._id)) : data.recent.map(row => String(row._id));
      const carry = data.truncated && previous?.partial && previous.completedThrough?.getTime() === data.coveredThrough.getTime() ? previous.processedIds : [];
      await AiWatchRun.updateOne({ _id: id, owner }, { $set: { findings, reply, completedThrough: data.coveredThrough, processedIds: [...new Set([...(carry || []), ...boundaryIds])], partial: data.truncated } });
    }
    if (findings.length) {
      if (!await AiWatchRun.exists({ _id: id, owner })) throw Error('Watch lease changed');
      const notificationId = createHash('sha256').update(`watch:${id}`).digest('hex').slice(0, 24);
      await NotificationModel.updateOne({ _id: notificationId }, { $setOnInsert: {
        title: `Spending Watch: ${findings.length} ${findings.length === 1 ? 'flag' : 'flags'}`,
        message: reply, type: 'REMINDER', metadata: { watchRunId: id, findingIds: findings.map(row => row.id) }
      } }, { upsert: true });
      await bumpDataRevision();
      if (PushService.isConfigured()) {
        const delivered = await PushService.send('Spending Watch', findings[0].message, `watch:${id}`, 'review', {
          skipInstallationIds: run.notifiedTo,
          onDelivered: async installationId => { await AiWatchRun.updateOne({ _id: id, owner }, { $addToSet: { notifiedTo: installationId } }); }
        });
        if (delivered.failed) throw Error('Watch alert retained; delivery will retry');
      }
    }
    await AiWatchRun.updateOne({ _id: id, owner }, { $set: { state: 'DONE' }, $unset: { error: '' } });
  } catch (error: any) {
    await AiWatchRun.updateOne({ _id: id, owner }, { $set: { state: 'PENDING', error: 'Watch check deferred; it will retry safely' } });
    throw error;
  } finally { await AiWatchRun.updateOne({ _id: id, owner }, { $unset: { owner: '', leaseUntil: '' } }); }
}
