import { Request, Response } from 'express';

export interface NotificationLog {
  id: string;
  title: string;
  message: string;
  type: 'SYNC' | 'TRANSACTION' | 'REMINDER' | 'SECURITY';
  createdAt: string;
  read: boolean;
}

class NotificationService {
  private notifications: NotificationLog[] = [
    {
      id: 'n1',
      title: 'Post-12 PM Sync Ready',
      message: 'Gmail email ingestion service is scheduled daily post 12:00 PM.',
      type: 'SYNC',
      createdAt: new Date().toISOString(),
      read: false
    }
  ];

  public getNotifications(): NotificationLog[] {
    return this.notifications;
  }

  public addNotification(title: string, message: string, type: NotificationLog['type']): NotificationLog {
    const newNotif: NotificationLog = {
      id: `n_${Date.now()}`,
      title,
      message,
      type,
      createdAt: new Date().toISOString(),
      read: false
    };
    this.notifications.unshift(newNotif);
    // Keep max 50 log items
    if (this.notifications.length > 50) {
      this.notifications.pop();
    }
    return newNotif;
  }

  public markAsRead(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (found) {
      found.read = true;
      return true;
    }
    return false;
  }
}

export const notificationService = new NotificationService();

export class NotificationController {
  public static getNotifications = (_req: Request, res: Response): void => {
    res.json({
      success: true,
      data: notificationService.getNotifications()
    });
  };

  public static triggerReminder = (req: Request, res: Response): void => {
    const { title, message } = req.body || {};
    const notif = notificationService.addNotification(
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

  public static markRead = (req: Request, res: Response): void => {
    const { id } = req.params;
    const ok = notificationService.markAsRead(id);
    res.json({ success: ok });
  };
}
