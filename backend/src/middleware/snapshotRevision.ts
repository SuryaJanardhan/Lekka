import { Request, Response, NextFunction } from 'express';
import { bumpDataRevision } from '../services/dataRevisionService';

export function changesSnapshot(method: string, path: string): boolean {
  return ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method) &&
    (/^\/(emails|categories|rules)(\/|$)/.test(path) || /^\/notifications\/(clear|[^/]+\/read)$/.test(path));
}

export function trackSnapshotChanges(req: Request, res: Response, next: NextFunction) {
  if (!changesSnapshot(req.method, req.path)) { next(); return; }
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 400 || body?.success === false) return json(body);
    // Await the version update before acknowledging a successful write.
    void bumpDataRevision().then(revision => json({ ...body, revision })).catch(() => {
      console.error('[Sync] Write saved but revision update failed');
      json({ ...body, syncRequired: true });
    });
    return res;
  };
  next();
}
