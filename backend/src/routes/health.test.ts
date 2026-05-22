import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../queue/violationQueue.js', () => ({
  violationQueue: {
    getJobCounts: async () =>
      Promise.resolve({
        waiting: 2,
        active: 1,
        delayed: 0,
        completed: 50,
        failed: 3,
        'waiting-children': 0,
      }),
  },
  QUEUE_NAME: 'test-queue',
}));

vi.mock('../config/redis.js', () => ({
  redisConnection: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

async function buildApp(): Promise<express.Express> {
  const { healthRouter } = await import('./health.js');
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('GET /health', () => {
  it('200 com ok:true, redis up e queue counts', async () => {
    const app = await buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      redis: 'up',
      queue: {
        name: 'test-queue',
        counts: {
          waiting: 2,
          active: 1,
          delayed: 0,
          completed: 50,
          failed: 3,
        },
      },
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('503 com redis:down quando ping falha', async () => {
    const redisMod = await import('../config/redis.js');
    const ping = redisMod.redisConnection.ping as ReturnType<typeof vi.fn>;
    ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const app = await buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.redis).toBe('down');
  });

  it('inclui timestamp ISO em todas as respostas', async () => {
    const app = await buildApp();
    const res = await request(app).get('/health');
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
