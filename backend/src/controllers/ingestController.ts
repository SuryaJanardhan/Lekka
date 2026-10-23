import { Request, Response } from 'express';
import { GmailService } from '../services/gmailService';
import { recordJobRun, requestJobSource } from '../services/jobRunService';
import { bumpDataRevision } from '../services/dataRevisionService';

export class IngestController {
  public static async recoverCredits(req: Request, res: Response) {
    try {
      const result = await recordJobRun('credit-recovery', requestJobSource(req), () => GmailService.recoverIgnoredCredits());
      await bumpDataRevision();
      res.json({ success: true, data: result });
    } catch (error: any) { res.status(502).json({ success: false, error: error.message || 'Credit recovery deferred' }); }
  }

  public static async previewIngestion(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await GmailService.previewIngestion() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async triggerManualIngestion(req: Request, res: Response) {
    try {
      const source = requestJobSource(req);
      const result = await recordJobRun('gmail-ingestion', source, () =>
        GmailService.processIngestionPipeline(source === 'VERCEL_CRON' ? 'automatic' : 'manual')
      );
      if (result.skipped) return res.status(409).json({ success: false, error: result.skipped, data: result });
      res.json({
        success: true,
        message: 'Email ingestion pipeline executed successfully',
        data: result
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
