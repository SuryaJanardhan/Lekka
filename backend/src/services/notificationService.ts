import { Request, Response } from 'express';
import { NotificationModel, NotificationType } from '../models/Notification';

export interface NotificationLog {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
}

class NotificationService {
  public async getNotifications(): Promise<NotificationLog[]> {
    const notifications = await NotificationModel.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return notifications.map((notification) => ({
      id: String(notification._id),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      createdAt: notification.createdAt.toISOString(),
      read: notification.read
    }));
  }

  public async addNotification(
    title: string,
    message: string,
    type: NotificationType,
    metadata: Record<string, any> = {}
  ): Promise<NotificationLog> {
    const notification = await NotificationModel.create({
      title,
      message,
      type,
      metadata
    });

    return {
      id: String(notification._id),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      createdAt: notification.createdAt.toISOString(),
      read: notification.read
    };
  }

  public async markAsRead(id: string): Promise<boolean> {
    const result = await NotificationModel.findByIdAndUpdate(id, { read: true });
    return Boolean(result);
  }
}

export const notificationService = new NotificationService();

export class NotificationController {
  public static getNotifications = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: await notificationService.getNotifications()
    });
  };

  public static triggerReminder = async (req: Request, res: Response): Promise<void> => {
    const { title, message } = req.body || {};
    const notif = await notificationService.addNotification(
      title || 'Daily Financial Reminder',
      message || 'Check your post-12 PM email receipts and expense sync in Lekka.',
      'REMINDER'
    );
    res.json({
      success: true,
      message: 'Reminder notification broadcasted successfully.',
      data: notif
    });
  };

  public static markRead = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const ok = await notificationService.markAsRead(id);
    res.json({ success: ok });
  };
}
