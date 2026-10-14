import { Request, Response } from 'express';
import { PushDeviceModel } from '../models/PushDevice';
import { PushService } from '../services/pushService';

export class PushController {
  static status = async (req: Request, res: Response) => {
    const installationId = req.query.installationId;
    res.json({ success: true, data: {
      configured: PushService.isConfigured(),
      registered: typeof installationId === 'string' && Boolean(await PushDeviceModel.exists({ installationId }))
    } });
  };

  static register = async (req: Request, res: Response) => {
    const { installationId, token } = req.body || {};
    if (typeof installationId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(installationId) || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
      return res.status(400).json({ success: false, error: 'Valid installation ID and FCM token required' });
    }
    try {
      await PushDeviceModel.findOneAndUpdate({ installationId }, { token, lastSeenAt: new Date() }, { upsert: true, new: true });
      res.json({ success: true, data: { registered: true } });
    } catch {
      res.status(500).json({ success: false, error: 'Could not register phone for notifications' });
    }
  };

  static digest = async (req: Request, res: Response) => {
    const kind = req.query.kind;
    if (kind !== 'morning' && kind !== 'evening') return res.status(400).json({ success: false, error: 'Choose morning or evening digest' });
    try {
      res.json({ success: true, data: await PushService.sendDigest(kind) });
    } catch (error: any) {
      res.status(PushService.isConfigured() ? 502 : 503).json({ success: false, error: error.message });
    }
  };
}
