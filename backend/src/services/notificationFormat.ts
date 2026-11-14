import { NotificationType } from '../models/Notification';

const emoji: Record<NotificationType, string> = { REVIEW: '🔎', SYNC: '🔄', TRANSACTION: '💸', REMINDER: '📊', SECURITY: '🔐' };
export function notificationTitle(title: string, type: NotificationType) {
  const clean = String(title || '').trim();
  return /^\p{Extended_Pictographic}/u.test(clean) ? clean : `${emoji[type]} ${clean}`;
}

export function privateTransactionConfirmation(direction: unknown) {
  return `${direction === 'CREDIT' ? 'Credit' : 'Debit'} saved. Open Lekka to view the details.`;
}
