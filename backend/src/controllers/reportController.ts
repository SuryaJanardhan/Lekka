import { Request, Response } from 'express';
import { InsightReportService } from '../services/insightReportService';

export class ReportController {
  static async list(req: Request, res: Response) {
    try { res.json({ success: true, data: await InsightReportService.list(Number(req.query.limit) || 24) }); }
    catch { res.status(503).json({ success: false, error: 'Reports unavailable' }); }
  }
  static async get(req: Request, res: Response) {
    try {
      const report = await InsightReportService.get(req.params.periodKey);
      if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
      res.json({ success: true, data: report });
    } catch { res.status(503).json({ success: false, error: 'Report unavailable' }); }
  }
}
