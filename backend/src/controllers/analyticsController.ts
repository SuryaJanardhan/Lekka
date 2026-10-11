import { Request, Response } from 'express';
import { LedgerReportService } from '../services/ledgerReportService';

export class AnalyticsController {
  public static async getDashboardStats(req: Request, res: Response) {
    try {
      const report = await LedgerReportService.getDashboardStats({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined
      });
      res.json({
        success: true,
        data: report
      });
    } catch (error: any) {
      const status = /date range|startDate/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }
}
