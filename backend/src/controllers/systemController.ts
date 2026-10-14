import { Request, Response } from 'express';
import { SyncStateModel } from '../models/SyncState';

export class SystemController {
  public static async getSyncStatus(_req: Request, res: Response) {
    try {
      const gmail = await SyncStateModel.findOne({ key: 'gmail' }).lean();
      res.json({
        success: true,
        data: {
          gmail: gmail ? {
            lastAttemptedSyncAt: gmail.lastAttemptedSyncAt || null,
            lastSuccessfulSyncAt: gmail.lastSuccessfulSyncAt || null,
            lastError: gmail.lastError || null,
            updatedAt: gmail.updatedAt
          } : null
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
