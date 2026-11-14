import { NextFunction, Request, Response } from 'express';
import { RateLimitModel } from '../models/RateLimit';

type Limit = { name: string; requests: number; windowMs: number };

function limitFor(req: Request): Limit {
  if (req.path === '/chat') return { name: 'ai', requests: 5, windowMs: 60_000 };
  if (req.path === '/ingest' || req.path === '/ingest/preview' || req.path === '/ingest/recover-credits') {
    return { name: 'ingestion', requests: 2, windowMs: 3_600_000 };
  }
  if (req.path === '/export') return { name: 'export', requests: 2, windowMs: 3_600_000 };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return { name: 'write', requests: 30, windowMs: 60_000 };
  return { name: 'read', requests: 120, windowMs: 60_000 };
}

export async function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const limit = limitFor(req);
  const now = Date.now();
  const bucket = Math.floor(now / limit.windowMs);
  const expiresAt = new Date((bucket + 1) * limit.windowMs + 60_000);
  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * limit.windowMs - now) / 1000));
  try {
    const row = await RateLimitModel.findOneAndUpdate(
      { _id: `${limit.name}:${bucket}`, count: { $lt: limit.requests } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    ).lean();
    if (!row) throw Object.assign(new Error('rate limit reached'), { code: 11000 });
    res.setHeader('X-RateLimit-Limit', String(limit.requests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit.requests - row.count)));
    next();
  } catch (error: any) {
    if (error?.code !== 11000) return next(error);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ success: false, error: 'Too many requests. Retry shortly.' });
  }
}
