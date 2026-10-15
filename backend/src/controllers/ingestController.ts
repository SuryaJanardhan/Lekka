import { Request, Response } from 'express';
import { GmailService } from '../services/gmailService';
import { recordJobRun, requestJobSource } from '../services/jobRunService';

export class IngestController {
  public static async triggerManualIngestion(req: Request, res: Response) {
    try {
      const source = requestJobSource(req);
      const result = await recordJobRun('gmail-ingestion', source, () =>
        GmailService.processIngestionPipeline(source === 'VERCEL_CRON' ? 'automatic' : 'manual')
      );
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
