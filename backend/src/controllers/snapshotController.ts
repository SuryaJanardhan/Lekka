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


  static async changes(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    try {
      const after = typeof req.query.after === 'string' ? req.query.after : '';
      res.json({ success: true, data: await SnapshotService.changes(after, req.query.includeCredits === 'true') });
    } catch (error: any) {
      res.status(error?.message === 'Invalid sync cursor' ? 400 : 503).json({ success: false, error: error?.message === 'Invalid sync cursor' ? error.message : 'Could not read incremental changes. Please retry.' });
    }
  }
}
