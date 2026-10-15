import { Schema, model, Document } from 'mongoose';

export type NotificationType = 'SYNC' | 'TRANSACTION' | 'REMINDER' | 'SECURITY' | 'REVIEW';

export interface INotification extends Document {
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  dismissed: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['SYNC', 'TRANSACTION', 'REMINDER', 'SECURITY', 'REVIEW'],
      required: true,
      index: true
    },
    read: { type: Boolean, default: false, index: true },
    dismissed: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

NotificationSchema.index({ createdAt: -1 });

export const NotificationModel = model<INotification>('Notification', NotificationSchema);
