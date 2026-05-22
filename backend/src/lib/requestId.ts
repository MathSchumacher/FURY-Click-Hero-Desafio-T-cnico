import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Correlation ID middleware.
 *
 * Reads `X-Request-Id` from the incoming request when present (so a caller
 * can chain its own trace id), or generates a fresh UUID. Echoes it back
 * on the response so the client can grep logs by the same id.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
