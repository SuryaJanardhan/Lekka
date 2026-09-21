import { Request, Response } from 'express';
import { GmailService } from '../services/gmailService.js';

export class IngestController {
  public static async triggerManualIngestion(_req: Request, res: Response) {
    try {
      const result = await GmailService.processIngestionPipeline();
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
