import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /jobs/:id agora lê do Postgres (fonte de verdade permanente)
 * em vez do Redis/BullMQ (que tem TTL nos jobs concluídos).
 *
 * Contrato preservado: { jobId, status, attempts, result, error }.
 * Diferença: status agora é o domain enum lowercase (queued/active/
 * completed/failed) em vez dos states do BullMQ.
 */

type FakeViolation = {
  jobId: string;
  status: 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  attempts: number;
  upstreamStatus: number | null;
  upstreamLatencyMs: number | null;
  errorMessage: string | null;
  adId: string;
  tenantId: string;
  finishedAt: Date | null;
};

const fakeViolations: Map<string, FakeViolation> = new Map();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    violation: {
      findFirst: async ({ where }: { where: { jobId: string } }) =>
        fakeViolations.get(where.jobId) ?? null,
    },
  },
}));

beforeEach(() => fakeViolations.clear());

async function buildApp(): Promise<express.Express> {
  const { jobsRouter } = await import('./jobs.js');
  const app = express();
  app.use(jobsRouter);
  return app;
}

function makeViolation(overrides: Partial<FakeViolation> & { jobId: string }): FakeViolation {
  return {
    status: 'QUEUED',
    attempts: 0,
    upstreamStatus: null,
    upstreamLatencyMs: null,
    errorMessage: null,
    adId: 'ad_1',
    tenantId: 't_1',
    finishedAt: null,
    ...overrides,
  };
}

describe('GET /jobs/:id', () => {
  it('404 quando job não existe no DB', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('shape { jobId, status, attempts, result, error } pra job completed', async () => {
    fakeViolations.set(
      'tenant_t__ad_42',
      makeViolation({
        jobId: 'tenant_t__ad_42',
        status: 'COMPLETED',
        attempts: 1,
        upstreamStatus: 200,
        upstreamLatencyMs: 134,
        adId: 'ad_42',
        tenantId: 'tenant_t',
        finishedAt: new Date('2026-05-21T14:23:01.412Z'),
      }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/tenant_t__ad_42');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jobId: 'tenant_t__ad_42',
      status: 'completed',
      attempts: 1,
      result: {
        upstreamStatus: 200,
        upstreamLatencyMs: 134,
        adId: 'ad_42',
        tenantId: 'tenant_t',
        finishedAt: '2026-05-21T14:23:01.412Z',
      },
      error: null,
    });
  });

  it('shape pra job failed: result=null, error=errorMessage', async () => {
    fakeViolations.set(
      'tenant_t__ad_42',
      makeViolation({
        jobId: 'tenant_t__ad_42',
        status: 'FAILED',
        attempts: 3,
        errorMessage: 'upstream HTTP 503',
      }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/tenant_t__ad_42');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: 'tenant_t__ad_42',
      status: 'failed',
      attempts: 3,
      result: null,
      error: 'upstream HTTP 503',
    });
  });

  it('shape pra job queued: result=null, error=null, attempts=0', async () => {
    fakeViolations.set(
      'tenant_t__ad_42',
      makeViolation({ jobId: 'tenant_t__ad_42', status: 'QUEUED' }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/tenant_t__ad_42');
    expect(res.body).toMatchObject({
      jobId: 'tenant_t__ad_42',
      status: 'queued',
      attempts: 0,
      result: null,
      error: null,
    });
  });

  it('shape pra job active: attempts já incrementado', async () => {
    fakeViolations.set(
      'tenant_t__ad_42',
      makeViolation({ jobId: 'tenant_t__ad_42', status: 'ACTIVE', attempts: 2 }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/tenant_t__ad_42');
    expect(res.body).toMatchObject({
      jobId: 'tenant_t__ad_42',
      status: 'active',
      attempts: 2,
      result: null,
    });
  });
});
