import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for POST /webhook/violation.
 *
 * The queue is replaced with an in-memory fake so the tests don't require
 * Redis. We assert the route's contract: status codes, response shape,
 * Zod validation behavior, and idempotency.
 */

type FakeJob = {
  id: string;
  state: 'waiting' | 'active' | 'delayed' | 'waiting-children' | 'completed' | 'failed';
  data: unknown;
  opts: unknown;
  getState: () => Promise<string>;
};

const fakeJobs: Map<string, FakeJob> = new Map();

vi.mock('../queue/violationQueue.js', async () => {
  const jobOptions =
    await vi.importActual<typeof import('../queue/jobOptions.js')>('../queue/jobOptions.js');
  return {
    ...jobOptions,
    QUEUE_NAME: 'test-queue',
    violationQueue: {
      getJob: async (id: string): Promise<FakeJob | undefined> => fakeJobs.get(id),
      add: async (_name: string, data: unknown, opts: { jobId: string }): Promise<FakeJob> => {
        const j: FakeJob = {
          id: opts.jobId,
          state: 'waiting',
          data,
          opts,
          getState: async () => 'waiting',
        };
        fakeJobs.set(opts.jobId, j);
        return j;
      },
    },
  };
});

beforeEach(() => {
  fakeJobs.clear();
});

async function buildApp(): Promise<express.Express> {
  const { webhookRouter } = await import('./webhook.js');
  const { requestId } = await import('../lib/requestId.js');
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use(webhookRouter);
  return app;
}

function seedInFlightJob(id: string, state: FakeJob['state'] = 'waiting'): void {
  fakeJobs.set(id, {
    id,
    state,
    data: null,
    opts: {},
    getState: async () => state,
  });
}

const validPayload = {
  adId: 'ad_42',
  tenantId: 'tenant_t',
  violationType: 'PROHIBITED_TERM',
  severity: 'HIGH',
  detectedAt: '2026-05-21T14:23:01Z',
};

describe('POST /webhook/violation', () => {
  it('202 com payload válido + jobId determinístico', async () => {
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      jobId: 'tenant_t:ad_42',
      status: 'queued',
      severity: 'HIGH',
    });
  });

  it('400 com payload inválido (severity fora do enum) + detalhes Zod', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, severity: 'SEVERE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payload inválido');
    expect(res.body.details.fieldErrors.severity).toBeDefined();
  });

  it('400 com payload sem campos obrigatórios', async () => {
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send({});
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors).toEqual(
      expect.objectContaining({
        adId: expect.any(Array),
        tenantId: expect.any(Array),
        violationType: expect.any(Array),
        severity: expect.any(Array),
        detectedAt: expect.any(Array),
      }),
    );
  });

  it('400 com detectedAt não-ISO', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, detectedAt: '21/05/2026' });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.detectedAt).toBeDefined();
  });

  it('200 + deduplicated:true quando job já está in-flight (waiting)', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t:ad_42', 'waiting');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: 'tenant_t:ad_42',
      deduplicated: true,
      status: 'waiting',
    });
  });

  it('200 + deduplicated:true quando job está active', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t:ad_42', 'active');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.deduplicated).toBe(true);
  });

  it('202 (novo job) quando job anterior está completed', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t:ad_42', 'completed');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
  });

  it('rejeita campos extras (schema .strict())', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, extra: 'foo' });
    expect(res.status).toBe(400);
  });
});
