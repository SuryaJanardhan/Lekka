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
    if (!run.checkedAt || Date.now() - run.checkedAt.getTime() > 48 * 3600000) {
      await AiWatchRun.updateOne({ _id: id, owner }, { state: 'DONE', findings: [], reply: 'Skipped stale watch check' }); return;
    }
    let findings: WatchFinding[] = run.findings;
    let reply = run.reply || '';
    if (!findings) {
      const data = await new ReadGateway().watchData(run.checkedAt);
      findings = [];
      for (const finding of detectWatchFindings(data)) {
        const saved = await AiWatchFinding.findOneAndUpdate({ _id: finding.id }, { $setOnInsert: { runId: id } }, { upsert: true, new: true }).lean();
        if (saved?.runId === id) findings.push(finding);
      }
      reply = findings.map(row => row.message).join('\n');
      if (findings.length) {
        const messages: any[] = [{ role: 'system', content: 'Summarize these possible spending issues in plain text. Never state fraud or duplication as proven. Do not invent facts or suggest automatic edits.' }, { role: 'user', content: reply }];
        if (inputUpperBound(messages) <= 800) {
          try { const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, ...{ reasoning_effort: 'none' } }, 'watch'); const explanation = response.choices[0]?.message?.content; if (explanation) reply += '\n' + explanation; } catch {}
        }
        if (data.truncated) reply += '\nCoverage: latest 200 newly processed debit records only.';
      }
      await AiWatchRun.updateOne({ _id: id, owner }, { $set: { findings, reply } });
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
