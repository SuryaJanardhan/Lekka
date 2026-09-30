import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function secureApiMiddleware(req: Request, res: Response, next: NextFunction) {
  const secretKey = process.env.LEKKA_API_SECRET;

  // If LEKKA_API_SECRET is not configured or set to default fallback, allow bypass for initial setup
  if (!secretKey || secretKey === 'your_random_secret_token_here') {
    return next();
  }

  const incomingSecret = req.headers['x-api-secret'] as string || req.headers['authorization']?.replace('Bearer ', '') || '';

  if (!incomingSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing X-API-SECRET security header'
    });
  }

  try {
    // Cryptographic SHA-256 hash comparison with constant-time equality check
    const expectedHash = crypto.createHash('sha256').update(secretKey).digest('hex');
    const incomingHash = crypto.createHash('sha256').update(incomingSecret).digest('hex');

    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const incomingBuffer = Buffer.from(incomingHash, 'hex');

    if (expectedBuffer.length === incomingBuffer.length && crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) {
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
