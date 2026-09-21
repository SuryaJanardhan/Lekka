import { Schema, model, Document, Types } from 'mongoose';

export interface IEmail extends Document {
  messageId: string;
  sender: string;
  subject: string;
  rawTextBody: string;
  parsedJson: Record<string, any>;
  hasAttachments: boolean;
  ocrExtractedText?: string;
  categoryId?: Types.ObjectId;
  categorySource: 'RULE' | 'GROQ_AI' | 'USER_MANUAL' | 'UNASSIGNED';
  aiConfidenceScore?: number;
  needsUserReview: boolean;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REASSIGNED';
  receivedAt: Date;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailSchema = new Schema<IEmail>(
  {
    messageId: { type: String, required: true, unique: true, index: true },
    sender: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    rawTextBody: { type: String, default: '' },
    parsedJson: { type: Schema.Types.Mixed, default: {} },
    hasAttachments: { type: Boolean, default: false },
    ocrExtractedText: { type: String },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    categorySource: {
      type: String,
      enum: ['RULE', 'GROQ_AI', 'USER_MANUAL', 'UNASSIGNED'],
      default: 'UNASSIGNED'
    },
    aiConfidenceScore: { type: Number, default: 0 },
    needsUserReview: { type: Boolean, default: false, index: true },
    reviewStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REASSIGNED'],
      default: 'APPROVED'
    },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const EmailModel = model<IEmail>('Email', EmailSchema);
