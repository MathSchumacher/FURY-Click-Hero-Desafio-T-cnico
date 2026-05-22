import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeFailedJob = {
  id: string;
  data: unknown;
  attemptsMade: number;
  failedReason?: string;
  timestamp?: number;
  finishedOn?: number;
};

const fakeFailed: FakeFailedJob[] = [];

vi.mock('../queue/violationQueue.js', () => ({
  violationQueue: {
    getJobs: async (states: string[], start: number, end: number): Promise<FakeFailedJob[]> => {
      if (!states.includes('failed')) return [];
      return fakeFailed.slice(start, end + 1);
    },
    getJobCounts: async () => ({ failed: fakeFailed.length }),
  },
  QUEUE_NAME: 'test-queue',
}));

beforeEach(() => {
  fakeFailed.length = 0;
});

async function buildApp(): Promise<express.Express> {
  const { deadLetterRouter } = await import('./deadletter.js');
  const app = express();
  app.use(deadLetterRouter);
  return app;
}

describe('GET /jobs/failed', () => {
  it('200 com lista vazia quando não há jobs failed', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/failed');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, jobs: [] });
  });

  it('retorna jobs com shape { jobId, attempts, failedReason, data, timestamps }', async () => {
    fakeFailed.push({
      id: 'tenant_a__ad_1',
      data: { adId: 'ad_1', tenantId: 'tenant_a', severity: 'CRITICAL' },
      attemptsMade: 3,
      failedReason: 'upstream HTTP 503',
      timestamp: 1700000000000,
      finishedOn: 1700000005000,
    });

    const app = await buildApp();
    const res = await request(app).get('/jobs/failed');
    expect(res.body.total).toBe(1);
    expect(res.body.jobs[0]).toMatchObject({
      jobId: 'tenant_a__ad_1',
      attempts: 3,
      failedReason: 'upstream HTTP 503',
      data: { adId: 'ad_1', tenantId: 'tenant_a', severity: 'CRITICAL' },
    });
    expect(res.body.jobs[0].queuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.jobs[0].failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('aceita ?limit=N (default 50, máx 200)', async () => {
    for (let i = 0; i < 60; i++) {
      fakeFailed.push({ id: `t:ad_${i}`, data: {}, attemptsMade: 3, failedReason: 'x' });
    }
    const app = await buildApp();

    const def = await request(app).get('/jobs/failed');
    expect(def.body.jobs).toHaveLength(50);

    const small = await request(app).get('/jobs/failed?limit=5');
    expect(small.body.jobs).toHaveLength(5);

    const overcap = await request(app).get('/jobs/failed?limit=999');
    expect(overcap.body.jobs).toHaveLength(60); /* cap=200 but só temos 60 */
  });

  it('400 quando ?limit não é número positivo', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/failed?limit=abc');
    expect(res.status).toBe(400);
  });
});
