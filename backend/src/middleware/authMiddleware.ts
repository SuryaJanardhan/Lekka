import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { runtimeConfig } from '../config/runtimeConfig';

export function secureApiMiddleware(req: Request, res: Response, next: NextFunction) {
  const isCronRoute = req.method === 'GET' && ['/ingest', '/notifications/digest'].includes(req.path);
  const secrets = [runtimeConfig.apiSecret];
  if (isCronRoute && process.env.CRON_SECRET && !req.headers['x-api-secret']) secrets.push(process.env.CRON_SECRET);

  const incomingSecret = req.headers['x-api-secret'] as string || req.headers['authorization']?.replace('Bearer ', '') || '';

  if (!incomingSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing X-API-SECRET security header'
    });
  }

  try {
    // Cryptographic SHA-256 hash comparison with constant-time equality check
    const incomingHash = crypto.createHash('sha256').update(incomingSecret).digest('hex');
    const incomingBuffer = Buffer.from(incomingHash, 'hex');
    if (secrets.some((secret) => {
      const expectedBuffer = crypto.createHash('sha256').update(secret).digest();
      return expectedBuffer.length === incomingBuffer.length && crypto.timingSafeEqual(expectedBuffer, incomingBuffer);
    })) {
      return next();
    }
  } catch (error) {
    console.error('[Security] Hash validation error:', error);
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: Invalid API security secret'
  });
}
