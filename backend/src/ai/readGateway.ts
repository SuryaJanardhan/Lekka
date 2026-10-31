import { Db, ObjectId } from 'mongodb';
import { aiReadDatabase } from './readConnection';
import { aiError, escapeRegex, PAGE_SIZE, SkillRequest, validateRequest } from './contract';

export const paise = { $toLong: { $round: [{ $multiply: [{ $convert: { input: '$parsedJson.detectedAmount', to: 'decimal', onError: 0, onNull: 0 } }, 100] }, 0] } };
const options = { maxTimeMS: 3000 };
export class ReadGateway {
  constructor(private database: () => Promise<Db> = aiReadDatabase) {}
  async categories() {
    const db = await this.database();
    return db.collection('categories').find({}, { ...options, projection: { name: 1 } }).sort({ name: 1 }).limit(201).toArray();
  }
  async execute(input: SkillRequest) {
    const request = validateRequest(input); const db = await this.database();
    const match: Record<string, any> = { receivedAt: { $gte: new Date(request.range.start), $lt: new Date(request.range.end) } };
    if (request.direction !== 'BOTH') match['parsedJson.transactionDirection'] = request.direction === 'DEBIT' ? { $ne: 'CREDIT' } : 'CREDIT';
    if (request.mode) match['parsedJson.paymentMode'] = request.mode === 'UPI' ? { $nin: ['CASH', 'CARD', 'FRIEND_PAID'] } : request.mode;
    if (request.category) {
      const category = await db.collection('categories').findOne({ name: new RegExp(`^${escapeRegex(request.category)}$`, 'i') }, { ...options, projection: { _id: 1 } });
      if (!category) throw aiError('Category not found. Use its name from Settings.');
      match.categoryId = category._id;
    }
    if (request.term) {
      const regex = new RegExp(escapeRegex(request.term), 'i');
      match.$or = [{ sender: regex }, { subject: regex }, { 'parsedJson.merchantName': regex }, { 'parsedJson.notes': regex }, { rawTextBody: regex }];
    }
    if (request.skill === 'rules') {
      const query = request.category ? { categoryId: match.categoryId } : {};
      const count = await db.collection('rules').countDocuments(query, options);
      const records = await db.collection('rules').aggregate([
        { $match: query }, { $sort: { priority: -1, _id: 1 } }, { $skip: (request.page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE },
        { $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: 'category' } },
        { $project: { _id: 0, category: { $arrayElemAt: ['$category.name', 0] }, conditions: 1, priority: 1 } }
      ], options).toArray();
      return { kind: 'rules', records, count, page: request.page, pageSize: PAGE_SIZE };
    }
    if (request.skill === 'spending' || request.skill === 'compare') {
      const rows = await db.collection('emails').aggregate([
        { $match: match }, { $addFields: { amount: paise, flow: { $cond: [{ $eq: ['$parsedJson.transactionDirection', 'CREDIT'] }, 'CREDIT', 'DEBIT'] } } },
        { $group: { _id: '$flow', amount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ], options).toArray();
      return { kind: 'summary', period: request.range, category: request.category, mode: request.mode,
        debitPaise: Number(rows.find(row => row._id !== 'CREDIT')?.amount || 0), creditPaise: Number(rows.find(row => row._id === 'CREDIT')?.amount || 0), count: rows.reduce((sum, row) => sum + row.count, 0) };
    }
    if (request.skill === 'review') match.$and = [{ $or: [{ needsUserReview: true }, { categoryId: null }, { categorySource: 'UNASSIGNED' }] }];
    const count = await db.collection('emails').countDocuments(match, options);
    const records = await db.collection('emails').aggregate([
      { $match: match }, { $sort: { receivedAt: -1, _id: -1 } }, { $skip: (request.page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE },
      { $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: 'category' } },
      { $project: { _id: 1, title: { $substrCP: [{ $ifNull: ['$parsedJson.merchantName', '$subject'] }, 0, 100] }, amount: paise,
        direction: { $ifNull: ['$parsedJson.transactionDirection', 'DEBIT'] }, date: '$receivedAt', mode: { $ifNull: ['$parsedJson.paymentMode', 'UPI'] },
        category: { $arrayElemAt: ['$category.name', 0] }, notes: { $substrCP: [{ $ifNull: ['$parsedJson.notes', ''] }, 0, 100] } } }
    ], options).toArray();
    return { kind: request.skill, records, count, page: request.page, pageSize: PAGE_SIZE, period: request.range };
  }
  async watchData(now = new Date(), from = new Date(now.getTime() - 26 * 3600000), excludedIds: string[] = []) {
    const db = await this.database(); const today = new Date(new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10) + 'T00:00:00+05:30');
    const recent = await db.collection('emails').find({ processedAt: { $gte: from, $lte: now }, _id: { $nin: excludedIds.filter(id => /^[a-f0-9]{24}$/i.test(id)).map(id => new ObjectId(id)) }, 'parsedJson.transactionDirection': { $ne: 'CREDIT' } }, {
      ...options, projection: { processedAt: 1, receivedAt: 1, categoryId: 1, subject: 1, 'parsedJson.detectedAmount': 1, 'parsedJson.merchantName': 1 }
    }).sort({ processedAt: 1, _id: 1 }).limit(201).toArray();
    const baseline = await db.collection('emails').aggregate([
      { $match: { _id: { $nin: recent.map(row => row._id) }, receivedAt: { $gte: new Date(today.getTime() - 90 * 86400000), $lt: today }, 'parsedJson.transactionDirection': { $ne: 'CREDIT' } } },
      { $group: { _id: null, average: { $avg: paise }, count: { $sum: 1 } } }
    ], options).toArray();
    const growth = await db.collection('emails').aggregate([
      { $match: { receivedAt: { $gte: new Date(today.getTime() - 13 * 86400000), $lte: now }, 'parsedJson.transactionDirection': { $ne: 'CREDIT' } } },
      { $group: { _id: { category: '$categoryId', current: { $gte: ['$receivedAt', new Date(today.getTime() - 6 * 86400000)] } }, amount: { $sum: paise }, count: { $sum: 1 } } }
    ], options).toArray();
    return { recent: recent.slice(0, 200), truncated: recent.length > 200, average: Number(baseline[0]?.average || 0), baselineCount: baseline[0]?.count || 0, growth, categories: await this.categories(),
      windowKey: today.toISOString(), coveredThrough: recent.length > 200 ? new Date(recent[199].processedAt) : now };
  }
}
