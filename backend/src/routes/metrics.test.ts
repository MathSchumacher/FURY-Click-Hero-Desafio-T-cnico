import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../queue/violationQueue.js', () => ({
  violationQueue: {
    getJobCounts: async () =>
      Promise.resolve({
        waiting: 4,
        active: 2,
        delayed: 1,
        completed: 132,
        failed: 7,
        'waiting-children': 0,
      }),
  },
  QUEUE_NAME: 'test-queue',
}));

async function buildApp(): Promise<express.Express> {
  const { metricsRouter } = await import('./metrics.js');
  const app = express();
  app.use(metricsRouter);
  return app;
}

describe('GET /metrics', () => {
  it('responde 200 com Content-Type text/plain', async () => {
    const app = await buildApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('expõe contadores Prometheus por estado', async () => {
    const app = await buildApp();
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/fury_jobs_total\{state="waiting"\}\s+4/);
    expect(res.text).toMatch(/fury_jobs_total\{state="active"\}\s+2/);
    expect(res.text).toMatch(/fury_jobs_total\{state="delayed"\}\s+1/);
    expect(res.text).toMatch(/fury_jobs_total\{state="completed"\}\s+132/);
    expect(res.text).toMatch(/fury_jobs_total\{state="failed"\}\s+7/);
  });

  it('inclui HELP e TYPE headers no formato Prometheus', async () => {
    const app = await buildApp();
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/^# HELP fury_jobs_total /m);
    expect(res.text).toMatch(/^# TYPE fury_jobs_total gauge/m);
  });

  it('expõe uptime do processo', async () => {
    const app = await buildApp();
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/^fury_process_uptime_seconds\s+\d/m);
  });
});
