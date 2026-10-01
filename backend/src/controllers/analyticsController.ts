import { Request, Response } from 'express';
import { EmailModel } from '../models/Email';

export class AnalyticsController {
  public static async getDashboardStats(_req: Request, res: Response) {
    try {
      const totalEmails = await EmailModel.countDocuments({});
      const pendingReviews = await EmailModel.countDocuments({ needsUserReview: true });
      const ruleCategorized = await EmailModel.countDocuments({ categorySource: 'RULE' });
      const aiCategorized = await EmailModel.countDocuments({ categorySource: 'GROQ_AI' });
      const userCategorized = await EmailModel.countDocuments({ categorySource: 'USER_MANUAL' });

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

      // Payment mode breakdown
      const paymentModeAggregation = await EmailModel.aggregate([
        {
          $match: { 'parsedJson.detectedAmount': { $exists: true, $ne: null } }
        },
        {
          $group: {
            _id: { $ifNull: ['$parsedJson.paymentMode', 'ONLINE'] },
            totalAmount: { $sum: '$parsedJson.detectedAmount' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Daily trend (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTrend = await EmailModel.aggregate([
        {
          $match: {
            receivedAt: { $gte: thirtyDaysAgo },
            'parsedJson.detectedAmount': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } },
            totalAmount: { $sum: '$parsedJson.detectedAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Monthly trend (last 12 months)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const monthlyTrend = await EmailModel.aggregate([
        {
          $match: {
            receivedAt: { $gte: oneYearAgo },
            'parsedJson.detectedAmount': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$receivedAt' } },
            totalAmount: { $sum: '$parsedJson.detectedAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

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
          categoryBreakdown,
          paymentModeBreakdown: paymentModeAggregation.map(item => ({
            mode: item._id,
            totalAmount: item.totalAmount,
            count: item.count
          })),
          dailyTrend: dailyTrend.map(item => ({
            date: item._id,
            totalAmount: item.totalAmount,
            count: item.count
          })),
          monthlyTrend: monthlyTrend.map(item => ({
            month: item._id,
            totalAmount: item.totalAmount,
            count: item.count
          }))
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
