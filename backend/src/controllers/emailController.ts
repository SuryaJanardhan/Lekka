import { Request, Response } from 'express';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleEngine } from '../services/ruleEngine';
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
      res.status(500).json({ success: false, error: error.message, data: [] });
    }
  }

  public static async getEmailById(req: Request, res: Response) {
    try {
      const email = await EmailModel.findById(req.params.id).populate('categoryId');
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

  public static async createManualTransaction(req: Request, res: Response) {
    try {
      const { title, amount, paymentMode, categoryId, notes, date, friendName } = req.body;
      if (!title || amount === undefined || amount === null) {
        return res.status(400).json({ success: false, error: 'Title and valid amount are required' });
      }

      const numAmount = Math.abs(parseFloat(amount));
      const transactionDate = date ? new Date(date) : new Date();

      let senderName = 'Manual Transaction';
      if (paymentMode === 'CASH') senderName = 'Cash Entry';
      else if (paymentMode === 'FRIEND_PAID') senderName = friendName ? `Friend: ${friendName}` : 'Friend Paid';
      else if (paymentMode === 'UPI') senderName = 'UPI Entry';
      else if (paymentMode === 'CARD') senderName = 'Card Entry';

      const email = new EmailModel({
        messageId: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        sender: senderName,
        subject: title,
        rawTextBody: notes || `Manual transaction entry: ${title}`,
        parsedJson: {
          detectedAmount: numAmount,
          currency: 'INR',
          paymentMode: paymentMode || 'CASH',
          friendName: friendName || '',
          notes: notes || '',
          isManual: true,
          merchantName: title
        },
        hasAttachments: false,
        categoryId: categoryId ? new Types.ObjectId(categoryId) : undefined,
        categorySource: 'USER_MANUAL',
        aiConfidenceScore: 100,
        needsUserReview: false,
        reviewStatus: 'APPROVED',
        receivedAt: transactionDate,
        processedAt: new Date()
      });

      await email.save();
      const populated = await EmailModel.findById(email._id).populate('categoryId');

      res.status(201).json({ success: true, message: 'Manual transaction saved successfully', data: populated });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
