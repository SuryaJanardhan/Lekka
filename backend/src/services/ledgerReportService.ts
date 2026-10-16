import { PipelineStage } from 'mongoose';
import { EmailModel } from '../models/Email';

export interface LedgerReportRange {
  startDate?: string;
  endDate?: string;
  now?: Date;
}

function currentMonthRange(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

function parseRange(input: LedgerReportRange) {
  const fallback = currentMonthRange(input.now);
  const start = input.startDate ? new Date(input.startDate) : fallback.start;
  const end = input.endDate ? new Date(input.endDate) : fallback.end;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid report date range');
  }

  if (start >= end) {
    throw new Error('Report startDate must be before endDate');
  }

  return { start, end };
}

const amountStage: PipelineStage.AddFields = {
  $addFields: {
    reportAmount: {
      $convert: {
        input: '$parsedJson.detectedAmount',
        to: 'double',
        onError: null,
        onNull: null
      }
    }
  }
};

function periodMatch(start: Date, end: Date): PipelineStage.Match {
  return {
    $match: {
      receivedAt: { $gte: start, $lt: end },
      reportAmount: { $gt: 0 }
    }
  };
}

export class LedgerReportService {
  public static async getDashboardStats(input: LedgerReportRange = {}) {
    const { start, end } = parseRange(input);

    const periodBase = [amountStage, periodMatch(start, end)];

    const [
      totals,
      sourceBreakdown,
      categoryBreakdown,
      paymentModeBreakdown,
      dailyTrend,
      monthlyTrend,
      yearlyTrend,
      pendingReviews
    ] = await Promise.all([
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: null,
            totalEmails: { $sum: 1 },
            totalFinancialAmount: { $sum: '$reportAmount' },
            averageAmount: { $avg: '$reportAmount' }
          }
        }
      ]),
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: '$categorySource',
            count: { $sum: 1 }
          }
        }
      ]),
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: '$categoryId',
            count: { $sum: 1 },
            totalAmount: { $sum: '$reportAmount' }
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
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            categoryName: { $ifNull: ['$category.name', 'Unassigned'] },
            colorCode: { $ifNull: ['$category.colorCode', '#9CA3AF'] },
            count: 1,
            totalAmount: 1
          }
        },
        { $sort: { totalAmount: -1 } }
      ]),
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: { $ifNull: ['$parsedJson.paymentMode', 'ONLINE'] },
            totalAmount: { $sum: '$reportAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]),
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } },
            totalAmount: { $sum: '$reportAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      EmailModel.aggregate([
        amountStage,
        {
          $match: {
            receivedAt: {
              $gte: new Date(start.getFullYear() - 1, start.getMonth(), 1),
              $lt: end
            },
            reportAmount: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$receivedAt' } },
            totalAmount: { $sum: '$reportAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      EmailModel.aggregate([
        amountStage,
        { $match: { reportAmount: { $gt: 0 } } },
        { $group: { _id: { $dateToString: { format: '%Y', date: '$receivedAt' } }, totalAmount: { $sum: '$reportAmount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      EmailModel.countDocuments({
        needsUserReview: true,
        receivedAt: { $gte: start, $lt: end }
      })
    ]);

    const total = totals[0] || { totalEmails: 0, totalFinancialAmount: 0, averageAmount: 0 };
    const sourceCounts = sourceBreakdown.reduce<Record<string, number>>((acc, item) => {
      acc[item._id || 'UNASSIGNED'] = item.count;
      return acc;
    }, {});

    const automaticCount = (sourceCounts.RULE || 0) + (sourceCounts.GROQ_AI || 0);

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      summary: {
        totalEmails: total.totalEmails,
        pendingReviews,
        totalFinancialAmount: total.totalFinancialAmount,
        averageAmount: total.averageAmount || 0,
        sources: {
          rule: sourceCounts.RULE || 0,
          ai: sourceCounts.GROQ_AI || 0,
          user: sourceCounts.USER_MANUAL || 0
        },
        aiAccuracyPercentage: total.totalEmails > 0 ? Math.round((automaticCount / total.totalEmails) * 100) : 100
      },
      categoryBreakdown,
      paymentModeBreakdown: paymentModeBreakdown.map((item) => ({
        mode: item._id,
        totalAmount: item.totalAmount,
        count: item.count
      })),
      dailyTrend: dailyTrend.map((item) => ({
        date: item._id,
        totalAmount: item.totalAmount,
        count: item.count
      })),
      yearlyTrend: yearlyTrend.map((item) => ({ year: item._id, totalAmount: item.totalAmount, count: item.count })),
      monthlyTrend: monthlyTrend.map((item) => ({
        month: item._id,
        totalAmount: item.totalAmount,
        count: item.count
      }))
    };
  }
}
