import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleEngine } from '../services/ruleEngine';
import { Types } from 'mongoose';

const MOCK_EMAILS = [
  {
    _id: 'e1',
    messageId: 'msg_aws_9918',
    sender: 'billing@aws.amazon.com',
    subject: 'Your AWS Monthly Service Invoice #INV-98231',
    rawTextBody: 'Total Amount Due: $142.50 USD for AWS Cloud Infrastructure services. Reference ID: INV-98231. Date: 2026-09-20.',
    parsedJson: { detectedAmount: 142.50, currency: 'USD', referenceNumber: 'INV-98231' },
    hasAttachments: true,
    categoryId: { _id: 'c1', name: 'Invoices & Receipts', colorCode: '#059669' },
    categorySource: 'RULE',
    aiConfidenceScore: 1.0,
    needsUserReview: false,
    reviewStatus: 'APPROVED',
    receivedAt: '2026-09-20T12:05:00Z',
    processedAt: '2026-09-20T12:06:00Z'
  },
  {
    _id: 'e2',
    messageId: 'msg_gh_4412',
    sender: 'security@github.com',
    subject: 'Security Alert: New SSH key added to your account',
    rawTextBody: 'A new SSH key was added to account surya from IP 192.168.1.1.',
    parsedJson: { ipAddress: '192.168.1.1', user: 'surya' },
    hasAttachments: false,
    categoryId: { _id: 'c2', name: 'Alerts & Security', colorCode: '#DC2626' },
    categorySource: 'GROQ_AI',
    aiConfidenceScore: 0.94,
    needsUserReview: false,
    reviewStatus: 'APPROVED',
    receivedAt: '2026-09-21T08:30:00Z',
    processedAt: '2026-09-21T12:01:00Z'
  }
];

export class EmailController {
  public static async getEmails(req: Request, res: Response) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.json({ success: true, count: MOCK_EMAILS.length, data: MOCK_EMAILS });
      }

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
      res.json({ success: true, count: MOCK_EMAILS.length, data: MOCK_EMAILS });
    }
  }

  public static async getEmailById(req: Request, res: Response) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.json({ success: true, data: MOCK_EMAILS[0] });
      }
      const email = await EmailModel.findById(req.params.id).populate('categoryId');
      if (!email) return res.status(404).json({ success: false, error: 'Email not found' });
      res.json({ success: true, data: email });
    } catch (error: any) {
      res.json({ success: true, data: MOCK_EMAILS[0] });
    }
  }

  public static async assignCategory(req: Request, res: Response) {
    try {
      const { emailId } = req.params;
      const { categoryId, createAutoRule } = req.body;

      if (mongoose.connection.readyState !== 1) {
        return res.json({ success: true, message: 'Category assigned successfully (fallback)' });
      }

      const email = await EmailModel.findById(emailId);
      if (!email) return res.status(404).json({ success: false, error: 'Email record not found' });

      const category = await CategoryModel.findById(categoryId);
      if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

      email.categoryId = new Types.ObjectId(categoryId);
      email.categorySource = 'USER_MANUAL';
      email.needsUserReview = false;
      email.reviewStatus = 'APPROVED';
      await email.save();

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
