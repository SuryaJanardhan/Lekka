import { NotificationType } from '../models/Notification';

export function remoteNotificationTarget(type: NotificationType, metadata: Record<string, any>) {
  if (type === 'REVIEW') return 'review';
  if (type === 'REMINDER') return 'insights';
  if (type === 'SYNC') {
    if (metadata.status === 'failed') return 'settings';
    if (Number(metadata.newIngested) > 0) return metadata.needsReviewCount > 0 ? 'review' : 'ledger';
  }
  return null;
}
