import { Request, Response } from 'express';
import { waitUntil } from '@vercel/functions';
import { OperationService, operationStatus } from '../services/operationService';
import { publishOperation, recoverOperations } from '../services/operationQueue';
import { OperationModel } from '../models/Operation';

function wake(id: string) { waitUntil(publishOperation(id).catch(() => console.error('[Operations] Change accepted durably; publish recovery pending'))); }

export class OperationController {
  static async accept(req: Request, res: Response) {
    try {
      const op = await OperationService.accept(req.body);
      if (op.state === 'PENDING') wake(op._id);
      res.status(202).json({ success: true, data: operationStatus(op) });
    } catch (error: any) { res.status(error.status || 503).json({ success: false, error: error.status ? error.message : 'Could not durably accept change. It is safe to retry with the same ID.' }); }
  }
  static async statuses(req: Request, res: Response) {
    try {
      const ids = String(req.query.ids || '').split(',').filter(Boolean);
      if (!ids.length || ids.length > 100) return res.status(400).json({ success: false, error: 'Request 1 to 100 operation IDs' });
      const rows = await OperationModel.find({ _id: { $in: ids } }).lean();
      waitUntil(recoverOperations());
      res.json({ success: true, data: rows.map(operationStatus) });
    } catch { res.status(503).json({ success: false, error: 'Operation status unavailable' }); }
  }
  static async resolve(req: Request, res: Response) {
    try {
      if (!['retry', 'discard'].includes(req.body.action)) return res.status(400).json({ success: false, error: 'Choose retry or discard' });
      const op = await OperationService.resolve(req.params.id, req.body.action, req.body.command);
      if (op.state === 'PENDING') wake(op._id);
      res.json({ success: true, data: operationStatus(op) });
    } catch (error: any) { res.status(error.status || 503).json({ success: false, error: error.status ? error.message : 'Could not resolve queued change' }); }
  }
}
