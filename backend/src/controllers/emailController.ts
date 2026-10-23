import { Request, Response } from 'express';
import { LedgerService } from '../services/ledgerService';

export class EmailController {
  public static async requestReview(req: Request, res: Response) {
    try {
      const entry = await LedgerService.requestReview(req.params.emailId);
      res.json({ success: true, data: entry });
    } catch (error: any) {
      const status = /not found/i.test(error.message) ? 404 : /invalid/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  public static async getEmails(req: Request, res: Response) {
    try {
      const { categoryId, needsReview, search } = req.query;
      const emails = await LedgerService.listEntries({
        categoryId: categoryId as string | undefined,
        needsReview: needsReview === 'true',
        search: search as string | undefined,
        includeCredits: req.query.includeCredits === 'true'
      });

      res.json({ success: true, count: emails.length, data: emails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message, data: [] });
    }
  }

  public static async getEmailById(req: Request, res: Response) {
    try {
      const email = await LedgerService.getEntryById(req.params.id);
      if (!email) return res.status(404).json({ success: false, error: 'Email record not found' });
      res.json({ success: true, data: email });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async assignCategory(req: Request, res: Response) {
    try {
      const { emailId } = req.params;
      const { categoryId, createAutoRule } = req.body;

      const email = await LedgerService.assignCategory({
        entryId: emailId,
        categoryId,
        createAutoRule
      });

      res.json({ success: true, message: 'Category assigned successfully', data: email });
    } catch (error: any) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  public static async createManualTransaction(req: Request, res: Response) {
    try {
      const populated = await LedgerService.createManualEntry(req.body);

      res.status(201).json({ success: true, message: 'Manual transaction saved successfully', data: populated });
    } catch (error: any) {
      const status = /required|positive|invalid/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  public static async updateTransaction(req: Request, res: Response) {
    try {
      const populated = await LedgerService.updateEntry(req.params.id, req.body);
      res.json({ success: true, message: 'Transaction updated successfully', data: populated });
    } catch (error: any) {
      const status = /not found/i.test(error.message) ? 404 : /required|positive|invalid/i.test(error.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  public static async deleteTransaction(req: Request, res: Response) {
    try {
      await LedgerService.deleteEntry(req.params.id);
      res.json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error: any) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  }
}
