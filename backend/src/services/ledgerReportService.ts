import { PipelineStage } from 'mongoose';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { categoryColors } from './categoryColors';

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
    reportDirection: { $ifNull: ['$parsedJson.transactionDirection', 'DEBIT'] },
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
    const debit = { $cond: [{ $eq: ['$reportDirection', 'CREDIT'] }, 0, '$reportAmount'] };
    const credit = { $cond: [{ $eq: ['$reportDirection', 'CREDIT'] }, '$reportAmount', 0] };

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
            totalTransactions: { $sum: 1 },
            totalEmails: { $sum: { $cond: [{ $eq: ['$reportDirection', 'CREDIT'] }, 0, 1] } },
            creditCount: { $sum: { $cond: [{ $eq: ['$reportDirection', 'CREDIT'] }, 1, 0] } },
            totalFinancialAmount: { $sum: debit },
            totalCredits: { $sum: credit }
          }
        }
      ]),
      EmailModel.aggregate([
        ...periodBase, { $match: { reportDirection: { $ne: 'CREDIT' } } },
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
            totalAmount: { $sum: debit },
            creditAmount: { $sum: credit }
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
            totalAmount: 1,
            creditAmount: 1
          }
        },
        { $sort: { totalAmount: -1 } }
      ]),
      EmailModel.aggregate([
        ...periodBase,
        {
          $group: {
            _id: { $cond: [{ $in: [{ $ifNull: ['$parsedJson.paymentMode', 'UPI'] }, ['ONLINE', '']] }, 'UPI', { $ifNull: ['$parsedJson.paymentMode', 'UPI'] }] },
            totalAmount: { $sum: debit },
            creditAmount: { $sum: credit },
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
            totalAmount: { $sum: debit }, creditAmount: { $sum: credit },
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
            totalAmount: { $sum: debit }, creditAmount: { $sum: credit },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      EmailModel.aggregate([
        amountStage,
        { $match: { reportAmount: { $gt: 0 } } },
        { $group: { _id: { $dateToString: { format: '%Y', date: '$receivedAt' } }, totalAmount: { $sum: debit }, creditAmount: { $sum: credit }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      EmailModel.countDocuments({
        needsUserReview: true,
        receivedAt: { $gte: start, $lt: end }
      })
    ]);

    const total = totals[0] || { totalEmails: 0, totalFinancialAmount: 0, totalCredits: 0, creditCount: 0, totalTransactions: 0 };
    const dbCategories = await CategoryModel.find({}).sort({ name: 1 }).lean();
    const colors = categoryColors(dbCategories);
    const fullBreakdown = dbCategories.map(category => {
      const row = categoryBreakdown.find(item => String(item._id) === String(category._id));
      return { _id: category._id, categoryName: category.name, colorCode: colors.get(String(category._id)), count: row?.count || 0, totalAmount: row?.totalAmount || 0, creditAmount: row?.creditAmount || 0 };
    });
    const unassigned = categoryBreakdown.find(row => !row._id);
    if (unassigned) fullBreakdown.push({ ...unassigned, categoryName: 'Unassigned', colorCode: '#9ca3af', creditAmount: unassigned.creditAmount || 0 });
    fullBreakdown.sort((a, b) => b.totalAmount - a.totalAmount || a.categoryName.localeCompare(b.categoryName));
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
        totalCredits: total.totalCredits || 0,
        debitCount: total.totalEmails,
        creditCount: total.creditCount || 0,
        totalTransactions: total.totalTransactions || total.totalEmails,
        netAmount: (total.totalCredits || 0) - total.totalFinancialAmount,
        averageAmount: total.totalEmails ? total.totalFinancialAmount / total.totalEmails : 0,
        sources: {
          rule: sourceCounts.RULE || 0,
          ai: sourceCounts.GROQ_AI || 0,
          user: sourceCounts.USER_MANUAL || 0
        },
        aiAccuracyPercentage: total.totalEmails > 0 ? Math.round((automaticCount / total.totalEmails) * 100) : 100
      },
      categoryBreakdown: fullBreakdown,
      paymentModeBreakdown: paymentModeBreakdown.map((item) => ({
        mode: item._id,
        totalAmount: item.totalAmount,
        creditAmount: item.creditAmount || 0,
        count: item.count
      })),
      dailyTrend: dailyTrend.map((item) => ({
        date: item._id,
        totalAmount: item.totalAmount,
        creditAmount: item.creditAmount || 0,
        count: item.count
      })),
      yearlyTrend: yearlyTrend.map((item) => ({ year: item._id, totalAmount: item.totalAmount, creditAmount: item.creditAmount || 0, count: item.count })),
      monthlyTrend: monthlyTrend.map((item) => ({
        month: item._id,
        totalAmount: item.totalAmount,
        creditAmount: item.creditAmount || 0,
        count: item.count
      }))
    };
  }
}
