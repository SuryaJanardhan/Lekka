import { Types } from 'mongoose';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleEngine } from './ruleEngine';
import { notificationService } from './notificationService';

export interface CreateManualLedgerEntryInput {
  title: string;
  amount: number;
  paymentMode?: 'CASH' | 'FRIEND_PAID' | 'UPI' | 'CARD';
  categoryId?: string;
  notes?: string;
  date?: string;
  friendName?: string;
}

export interface UpdateLedgerEntryInput extends CreateManualLedgerEntryInput {}

export class LedgerService {
  public static async listEntries(params: {
    categoryId?: string;
    needsReview?: boolean;
    search?: string;
    limit?: number;
  }) {
    const query: any = {};

    if (params.categoryId) query.categoryId = params.categoryId;
    if (params.needsReview) query.needsUserReview = true;
    if (params.search) {
      query.$or = [
        { subject: { $regex: params.search, $options: 'i' } },
        { sender: { $regex: params.search, $options: 'i' } },
        { rawTextBody: { $regex: params.search, $options: 'i' } }
      ];
    }

    const limit = Math.min(Math.max(params.limit || 100, 1), 250);
    return EmailModel.find(query).populate('categoryId').sort({ receivedAt: -1 }).limit(limit);
  }

  public static async getEntryById(id: string) {
    return EmailModel.findById(id).populate('categoryId');
  }

  public static async createManualEntry(input: CreateManualLedgerEntryInput) {
    if (!input.title?.trim()) {
      throw new Error('Title is required');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const paymentMode = input.paymentMode || 'CASH';
    const transactionDate = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(transactionDate.getTime())) {
      throw new Error('Transaction date is invalid');
    }

    let senderName = 'Manual Transaction';
    if (paymentMode === 'CASH') senderName = 'Cash Entry';
    else if (paymentMode === 'FRIEND_PAID') senderName = input.friendName ? `Friend: ${input.friendName}` : 'Friend Paid';
    else if (paymentMode === 'UPI') senderName = 'UPI Entry';
    else if (paymentMode === 'CARD') senderName = 'Card Entry';

    const email = new EmailModel({
      messageId: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      sender: senderName,
      subject: input.title.trim(),
      rawTextBody: input.notes || `Manual transaction entry: ${input.title.trim()}`,
      parsedJson: {
        detectedAmount: amount,
        currency: 'INR',
        paymentMode,
        friendName: input.friendName || '',
        notes: input.notes || '',
        isManual: true,
        merchantName: input.title.trim()
      },
      hasAttachments: false,
      categoryId: input.categoryId ? new Types.ObjectId(input.categoryId) : undefined,
      categorySource: 'USER_MANUAL',
      aiConfidenceScore: 100,
      needsUserReview: false,
      reviewStatus: 'APPROVED',
      receivedAt: transactionDate,
      processedAt: new Date()
    });

    await email.save();
    return EmailModel.findById(email._id).populate('categoryId');
  }

  public static async updateEntry(id: string, input: UpdateLedgerEntryInput) {
    const email = await EmailModel.findById(id);
    if (!email) {
      throw new Error('Ledger entry not found');
    }

    if (!input.title?.trim()) {
      throw new Error('Title is required');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const transactionDate = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(transactionDate.getTime())) {
      throw new Error('Transaction date is invalid');
    }

    const paymentMode = input.paymentMode || 'CASH';
    const learningSubject = email.parsedJson?.categoryLearningSubject || email.subject;
    const learningMerchant = email.parsedJson?.categoryLearningMerchant || email.parsedJson?.merchantName;
    const learningBody = email.rawTextBody;
    const learnCategory = !email.parsedJson?.isManual && input.categoryId &&
      (email.needsUserReview || String(email.categoryId || '') !== input.categoryId);
    email.subject = input.title.trim();
    if (email.parsedJson?.isManual) email.rawTextBody = input.notes || `Manual transaction entry: ${input.title.trim()}`;
    email.parsedJson = {
      ...email.parsedJson,
      categoryLearningSubject: learningSubject,
      categoryLearningMerchant: learningMerchant,
      detectedAmount: amount,
      currency: 'INR',
      paymentMode,
      friendName: input.friendName || '',
      notes: input.notes || '',
      merchantName: input.title.trim()
    };
    email.categoryId = input.categoryId ? new Types.ObjectId(input.categoryId) : undefined;
    email.categorySource = 'USER_MANUAL';
    email.needsUserReview = false;
    email.reviewStatus = 'APPROVED';
    email.receivedAt = transactionDate;

    await email.save();
    if (learnCategory) {
      await RuleEngine.autoGenerateRuleFromUserFeedback(learningSubject, email.sender,
        new Types.ObjectId(input.categoryId), learningMerchant, learningBody);
    }
    await notificationService.resolveCategoryReview(String(email._id));
    return EmailModel.findById(email._id).populate('categoryId');
  }

  public static async deleteEntry(id: string) {
    const result = await EmailModel.findByIdAndDelete(id);
    if (!result) {
      throw new Error('Ledger entry not found');
    }
    await notificationService.resolveCategoryReview(id);
  }

  public static async requestReview(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new Error('Invalid ledger entry ID');
    const entry = await EmailModel.findByIdAndUpdate(id, {
      $set: { needsUserReview: true, reviewStatus: 'PENDING' }
    }, { new: true }).populate('categoryId');
    if (!entry) throw new Error('Ledger entry not found');
    await notificationService.notifyCategoryReview(entry);
    return entry;
  }

  public static async assignCategory(params: {
    entryId: string;
    categoryId: string;
    createAutoRule?: boolean;
  }) {
    const email = await EmailModel.findById(params.entryId);
    if (!email) {
      throw new Error('Ledger entry not found');
    }

    const category = await CategoryModel.findById(params.categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    email.categoryId = new Types.ObjectId(params.categoryId);
    email.categorySource = 'USER_MANUAL';
    email.needsUserReview = false;
    email.reviewStatus = 'APPROVED';
    await email.save();

    if (params.createAutoRule !== false) {
      await RuleEngine.autoGenerateRuleFromUserFeedback(
        email.parsedJson?.categoryLearningSubject || email.subject,
        email.sender,
        new Types.ObjectId(params.categoryId),
        email.parsedJson?.categoryLearningMerchant || email.parsedJson?.merchantName,
        email.rawTextBody
      );
    }
    await notificationService.resolveCategoryReview(String(email._id));

    return EmailModel.findById(email._id).populate('categoryId');
  }
}
