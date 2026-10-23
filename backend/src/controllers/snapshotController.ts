import { Request, Response } from 'express';
import { SnapshotService } from '../services/snapshotService';

export class SnapshotController {
  static async status(_req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    try { res.json({ success: true, data: await SnapshotService.status() }); }
    catch { res.status(503).json({ success: false, error: 'Sync status unavailable' }); }
  }

  static async snapshot(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    try { res.json({ success: true, data: await SnapshotService.snapshot(req.query.includeCredits === 'true') }); }
    catch { res.status(503).json({ success: false, error: 'Could not read a complete snapshot. Please retry.' }); }
  }
}
