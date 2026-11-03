import { Schema, model } from 'mongoose';

const InsightReportSchema = new Schema({
  periodKey: { type: String, required: true, unique: true, index: true },
  kind: { type: String, enum: ['weekly', 'monthly'], required: true },
  period: { startDate: String, endDate: String, label: String },
  summary: { spend: Number, credits: Number, net: Number, debitCount: Number, creditCount: Number, totalTransactions: Number },
  topCategories: [{ name: String, spend: Number, credits: Number, count: Number, changePercent: Number }],
  paymentModes: [{ mode: String, spend: Number, credits: Number, count: Number }],
  largestTransactions: [{ title: String, amount: Number, direction: String, category: String, date: Date }],
  comparison: { previousLabel: String, previousSpend: Number, spendDelta: Number, spendChangePercent: Number, previousCredits: Number, creditsDelta: Number },
  pendingReviews: Number,
  sourceRevision: String,
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
InsightReportSchema.index({ kind: 1, 'period.startDate': -1 });
export const InsightReportModel = model('InsightReport', InsightReportSchema);
