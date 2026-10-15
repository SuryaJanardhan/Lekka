import { Request, Response } from 'express';
import { NotificationModel, NotificationType } from '../models/Notification';
import { PushService } from './pushService';
import { remoteNotificationTarget } from './pushPolicy';

export interface NotificationLog {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  remoteDelivery?: { sent: number; failed: number; registered: number };
}

class NotificationService {
  public async getNotifications(): Promise<NotificationLog[]> {
    const [reviews, history] = await Promise.all([
      NotificationModel.find({ dismissed: { $ne: true }, type: 'REVIEW', read: false }).sort({ createdAt: 1 }).limit(50).lean(),
      NotificationModel.find({ dismissed: { $ne: true }, $or: [{ type: { $ne: 'REVIEW' } }, { read: true }] }).sort({ createdAt: -1 }).limit(30).lean()
    ]);
    const notifications = [...reviews, ...history];
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

    const screen = remoteNotificationTarget(type, metadata);
    let remoteDelivery;
    if (screen && PushService.isConfigured()) {
      try {
        remoteDelivery = await PushService.send(title, message, `notification-${notification._id}`, screen);
      } catch {
        console.error('[Push] Remote alert failed; the in-app notification is saved');
      }
    }

    return {
      id: String(notification._id),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      createdAt: notification.createdAt.toISOString(),
      read: notification.read,
      ...(remoteDelivery ? { remoteDelivery } : {})
    };
  }

  public async markAsRead(id: string): Promise<boolean> {
    const result = await NotificationModel.findByIdAndUpdate(id, { read: true });
    return Boolean(result);
  }

  public async clearAll(): Promise<number> {
    const result = await NotificationModel.updateMany({ dismissed: { $ne: true } }, { $set: { read: true, dismissed: true } });
    return result.modifiedCount;
  }
}

export const notificationService = new NotificationService();

export class NotificationController {
  public static clearAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const cleared = await notificationService.clearAll();
      res.json({ success: true, data: { cleared } });
    } catch {
      res.status(500).json({ success: false, error: 'Could not clear notifications' });
    }
  };

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
      message || 'Review your latest expenses and pending receipts in Lekka.',
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
