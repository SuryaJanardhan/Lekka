import { google } from 'googleapis';
import { createHash } from 'crypto';
import { PushDeviceModel, PushDispatchModel } from '../models/PushDevice';
import { EmailModel } from '../models/Email';
import { NotificationModel } from '../models/Notification';
import { DigestKind, digestPeriod, digestText } from './pushSummary';

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    if (!account.project_id || !account.client_email || !account.private_key) return null;
    return account;
  } catch { return null; }
}

export class PushService {
  static isConfigured() { return Boolean(credentials()); }

  static async send(title: string, body: string, key: string, screen: string) {
    const account = credentials();
    if (!account) throw new Error('Firebase Cloud Messaging is not configured');
    const devices = await PushDeviceModel.find({}).lean();
    if (!devices.length) return { sent: 0, failed: 0, registered: 0 };
    const auth = new google.auth.GoogleAuth({ credentials: account, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const client = await auth.getClient();
    let sent = 0;
    let failed = 0;
    const tag = createHash('sha256').update(key).digest('hex').slice(0, 32);
    // Notification payloads let Android display a message while the app is closed.
    for (const device of devices) {
      try {
        await client.request({
          url: `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
          method: 'POST', timeout: 10000,
          data: { message: {
            token: device.token,
            notification: { title, body },
            data: { screen, notificationKey: key },
            android: { priority: 'high', ttl: '21600s', notification: { channel_id: 'lekka_alerts', icon: 'ic_stat_lekka', color: '#14B8A6', tag, visibility: 'PRIVATE' } }
          } }
        });
        sent++;
      } catch (error: any) {
        const code = error.response?.data?.error?.details?.find((detail: any) => detail.errorCode)?.errorCode;
        if (code === 'UNREGISTERED') await PushDeviceModel.deleteOne({ _id: device._id, token: device.token });
        else failed++;
        console.error('[Push] Delivery failed:', code || error.response?.status || 'transport error');
      }
    }
    return { sent, failed, registered: devices.length };
  }

  static async sendDigest(kind: DigestKind, now = new Date()) {
    if (!this.isConfigured()) throw new Error('Firebase Cloud Messaging is not configured');
    if (!await PushDeviceModel.exists({})) return { skipped: 'No registered phones', sent: 0 };
    const period = digestPeriod(kind, now);
    const key = `digest-${period.key}`;
    let claim;
    try {
      claim = await PushDispatchModel.findOneAndUpdate({ key, $or: [
        { state: 'failed' },
        { state: 'sending', claimedAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }
      ] }, { $set: { state: 'sending', claimedAt: now }, $setOnInsert: { key } }, { upsert: true, new: true });
    } catch (error: any) {
      if (error.code === 11000) return { skipped: 'Already sent or in progress', sent: 0 };
      throw error;
    }
    try {
      const sum = async (start: Date, end: Date) => {
        const [row] = await EmailModel.aggregate([
          { $match: { receivedAt: { $gte: start, $lt: end } } },
          { $project: { amount: { $convert: { input: '$parsedJson.detectedAmount', to: 'double', onError: 0, onNull: 0 } } } },
          { $match: { amount: { $gt: 0 } } },
          { $group: { _id: null, spend: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        return row || { spend: 0, count: 0 };
      };
      const [daily, monthly, reviewEntries, reviewEmails] = await Promise.all([
        sum(period.start, period.end), sum(period.monthStart, now),
        EmailModel.countDocuments({ needsUserReview: true }),
        NotificationModel.countDocuments({ type: 'REVIEW', read: false })
      ]);
      const { title, message } = digestText(kind, { ...daily, monthSpend: monthly.spend, pending: reviewEntries + reviewEmails });
      const result = await this.send(title, message, key, 'insights');
      await PushDispatchModel.updateOne({ _id: claim._id }, { state: result.failed ? 'failed' : 'sent', sentCount: result.sent });
      if (result.failed) throw new Error('Some phones could not receive the daily summary');
      await NotificationModel.create({ title, message, type: 'REMINDER', metadata: { key, remoteSent: result.sent } });
      return result;
    } catch (error) {
      await PushDispatchModel.updateOne({ _id: claim._id }, { state: 'failed' });
      throw error;
    }
  }
}
