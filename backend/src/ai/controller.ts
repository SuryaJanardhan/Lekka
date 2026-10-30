import { Request, Response } from 'express';
import { AiProvider } from './provider';
import { aiReadDatabase } from './readConnection';
import { AiWatchRun } from './watchModels';

export class AiController {
  static async status(_req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    try {
      const status = await AiProvider.status();
      let readReady = false, setupError = '';
      if (status.readOnlyConfigured) {
        try { await aiReadDatabase(); readReady = true; }
        catch (error: any) { setupError = error.message; }
      }
      const watch = await AiWatchRun.findOne({}).sort({ checkedAt: -1 }).select('state checkedAt error').lean();
      res.json({ success: true, data: { ...status, readReady, setupError, lastWatch: watch ? { state: watch.state, checkedAt: watch.checkedAt, error: watch.error } : null } });
    } catch { res.status(503).json({ success: false, error: 'AI status unavailable' }); }
  }
}
