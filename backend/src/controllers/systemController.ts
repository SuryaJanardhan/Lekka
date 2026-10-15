import { Request, Response } from 'express';
import { SyncStateModel } from '../models/SyncState';
import { JobRunModel } from '../models/JobRun';
import { NotificationModel } from '../models/Notification';

export class SystemController {
  public static async getSyncStatus(_req: Request, res: Response) {
    try {
      const [gmail, jobs, lastSync] = await Promise.all([
        SyncStateModel.findOne({ key: 'gmail' }).lean(),
        JobRunModel.find({}).sort({ startedAt: -1 }).limit(15).lean(),
        NotificationModel.findOne({ type: 'SYNC' }).sort({ createdAt: -1 }).select('createdAt metadata').lean()
      ]);
      res.json({
        success: true,
        data: {
          gmail: gmail ? {
            lastAttemptedSyncAt: gmail.lastAttemptedSyncAt || null,
            lastSuccessfulSyncAt: gmail.lastSuccessfulSyncAt || null,
            lastError: gmail.lastError || null,
            updatedAt: gmail.updatedAt,
            lastRecordedSource: lastSync?.metadata?.source || null,
            lastResult: lastSync ? {
              createdAt: lastSync.createdAt,
              newIngested: lastSync.metadata?.newIngested ?? null,
              notificationOnlyCount: lastSync.metadata?.notificationOnlyCount ?? null,
              needsReviewCount: lastSync.metadata?.needsReviewCount ?? null
            } : null
          } : null,
          schedules: [
            { job: 'gmail-ingestion', timeZone: 'Asia/Kolkata', scheduledTime: '00:00 daily' },
            { job: 'notifications-morning', timeZone: 'Asia/Kolkata', scheduledTime: '09:00 daily, pending items only' },
            { job: 'notifications-evening', timeZone: 'Asia/Kolkata', scheduledTime: '21:00 daily', notificationWhen: 'Sundays and last day of month only' }
          ],
          jobs
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
