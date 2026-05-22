import { Router, type Request, type Response } from 'express';
import { QUEUE_NAME, violationQueue } from '../queue/violationQueue.js';
import { redisConnection } from '../config/redis.js';

export const healthRouter: Router = Router();

/**
 * GET /health — deep health check:
 *   - pings Redis
 *   - reads BullMQ job counts
 *   - reports uptime
 *
 * Returns 200 when everything is reachable, 503 when Redis is down. Designed
 * for k8s liveness/readiness probes and uptime monitors.
 */
healthRouter.get('/health', async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  let redisStatus: 'up' | 'down' = 'down';
  let counts: Record<string, number> | null = null;
  let redisError: string | null = null;

  try {
    /* ioredis types ping() as Promise<'PONG'> but at runtime it can be any
       string ('PONG', '', or custom from a Redis-compatible server). */
    const pong: string = await redisConnection.ping();
    redisStatus = pong === 'PONG' ? 'up' : 'down';
  } catch (err) {
    redisError = err instanceof Error ? err.message : 'unknown redis error';
  }

  if (redisStatus === 'up') {
    try {
      counts = await violationQueue.getJobCounts();
    } catch (err) {
      redisError = err instanceof Error ? err.message : 'queue counts failed';
    }
  }

  const ok = redisStatus === 'up' && counts !== null;
  const body = {
    ok,
    redis: redisStatus,
    queue: {
      name: QUEUE_NAME,
      counts: counts ?? {},
    },
    uptimeSeconds: Math.round(process.uptime()),
    checkDurationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
    ...(redisError ? { error: redisError } : {}),
  };

  return res.status(ok ? 200 : 503).json(body);
});
