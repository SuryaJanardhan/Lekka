import { Request, Response } from 'express';
import { ExportService } from '../services/exportService.js';

export class ExportController {
  public static async getLLMContextBundle(_req: Request, res: Response) {
    try {
      const exportData = await ExportService.generateLLMContextBundle();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="lekka_llm_export.json"');
      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
