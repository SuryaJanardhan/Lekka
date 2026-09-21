import { Request, Response } from 'express';
import { EmailModel } from '../models/Email.js';
import { CategoryModel } from '../models/Category.js';
import { RuleEngine } from '../services/ruleEngine.js';
import { Types } from 'mongoose';

export class EmailController {
  public static async getEmails(req: Request, res: Response) {
    try {
      const { categoryId, needsReview, search } = req.query;
      const query: any = {};

      if (categoryId) query.categoryId = categoryId;
      if (needsReview === 'true') query.needsUserReview = true;
      if (search) {
        query.$or = [
          { subject: { $regex: search as string, $options: 'i' } },
          { sender: { $regex: search as string, $options: 'i' } },
          { rawTextBody: { $regex: search as string, $options: 'i' } }
        ];
      }

      const emails = await EmailModel.find(query)
        .populate('categoryId')
        .sort({ receivedAt: -1 })
        .limit(100);

      res.json({ success: true, count: emails.length, data: emails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async getEmailById(req: Request, res: Response) {
    try {
      const email = await EmailModel.findById(req.params.id).populate('categoryId');
      if (!email) return res.status(404).json({ success: false, error: 'Email not found' });
      res.json({ success: true, data: email });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async assignCategory(req: Request, res: Response) {
    try {
      const { emailId } = req.params;
      const { categoryId, createAutoRule } = req.body;

      const email = await EmailModel.findById(emailId);
      if (!email) return res.status(404).json({ success: false, error: 'Email record not found' });

      const category = await CategoryModel.findById(categoryId);
      if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

      email.categoryId = new Types.ObjectId(categoryId);
      email.categorySource = 'USER_MANUAL';
      email.needsUserReview = false;
      email.reviewStatus = 'APPROVED';
      await email.save();

      // Trigger automatic rule generation from user feedback if requested
      if (createAutoRule !== false) {
        await RuleEngine.autoGenerateRuleFromUserFeedback(
          email.subject,
          email.sender,
          new Types.ObjectId(categoryId)
        );
      }

      res.json({ success: true, message: 'Category assigned successfully', data: email });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
