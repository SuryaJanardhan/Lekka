import { Request, Response } from 'express';
import { EmailModel } from '../models/Email.js';
import { CategoryModel } from '../models/Category.js';

export class AnalyticsController {
  public static async getDashboardStats(_req: Request, res: Response) {
    try {
      const totalEmails = await EmailModel.countDocuments({});
      const pendingReviews = await EmailModel.countDocuments({ needsUserReview: true });
      const ruleCategorized = await EmailModel.countDocuments({ categorySource: 'RULE' });
      const aiCategorized = await EmailModel.countDocuments({ categorySource: 'GROQ_AI' });
      const userCategorized = await EmailModel.countDocuments({ categorySource: 'USER_MANUAL' });

      // Category breakdown aggregation
      const categoryBreakdown = await EmailModel.aggregate([
        {
          $group: {
            _id: '$categoryId',
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $unwind: { path: '$category', preserveNullAndEmptyArrays: true }
        },
        {
          $project: {
            categoryName: { $ifNull: ['$category.name', 'Unassigned'] },
            colorCode: { $ifNull: ['$category.colorCode', '#9CA3AF'] },
            count: 1
          }
        }
      ]);

      // Financial totals extraction from parsed JSON payloads
      const amountAggregation = await EmailModel.aggregate([
        {
          $match: { 'parsedJson.detectedAmount': { $exists: true, $ne: null } }
        },
        {
          $group: {
            _id: null,
            totalFinancialAmount: { $sum: '$parsedJson.detectedAmount' },
            countWithAmount: { $sum: 1 }
          }
        }
      ]);

      const totalFinancialAmount = amountAggregation[0]?.totalFinancialAmount || 0;

      res.json({
        success: true,
        data: {
          summary: {
            totalEmails,
            pendingReviews,
            totalFinancialAmount,
            sources: {
              rule: ruleCategorized,
              ai: aiCategorized,
              user: userCategorized
            },
            aiAccuracyPercentage: totalEmails > 0 ? Math.round(((ruleCategorized + aiCategorized) / totalEmails) * 100) : 100
          },
          categoryBreakdown
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
