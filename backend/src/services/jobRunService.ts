import { Request } from 'express';
import { JobRunModel } from '../models/JobRun';

export function requestJobSource(req: Pick<Request, 'get'>) {
  return req.get('user-agent')?.startsWith('vercel-cron/') ? 'VERCEL_CRON' : 'MANUAL';
}

export async function recordJobRun<T>(job: string, source: 'VERCEL_CRON' | 'MANUAL', run: () => Promise<T>): Promise<T> {
  // Audit storage must not prevent the actual financial job from running.
  const entry = await JobRunModel.create({ job, source, status: 'RUNNING', startedAt: new Date() }).catch(() => {
    console.error('[Jobs] Could not record job start');
    return null;
  });
  try {
    const result = await run();
    const skipped = typeof result === 'object' && result !== null && 'skipped' in result;
    if (entry) await JobRunModel.updateOne({ _id: entry._id }, {
      status: skipped ? 'SKIPPED' : 'SUCCEEDED', finishedAt: new Date(), result
    }).catch(() => console.error('[Jobs] Could not record job result'));
    return result;
  } catch (error) {
    if (entry) await JobRunModel.updateOne({ _id: entry._id }, {
      status: 'FAILED', finishedAt: new Date(), error: error instanceof Error ? error.message : 'Job failed'
    }).catch(() => console.error('[Jobs] Could not record job failure'));
    throw error;
  }
}
