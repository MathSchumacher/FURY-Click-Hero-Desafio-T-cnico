import { execSync } from 'node:child_process';
import express, { type Express } from 'express';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue, QueueEvents, Worker } from 'bullmq';

import { createViolationQueue } from './queue/factory.js';
import { createTakedownWorker } from './worker/createWorker.js';
import { buildJobId } from './queue/jobOptions.js';
import { isInFlight } from './routes/_jobState.js';
import { violationPayloadSchema } from './schemas/violation.js';
import type { TakedownResult, ViolationPayload } from './schemas/violation.js';

/**
 * End-to-end suite — proves the full flow against a REAL Redis (testcontainers)
 * and a REAL BullMQ Worker. Mocks only the upstream HTTP call so the test
 * doesn't depend on JSONPlaceholder being reachable.
 *
 * Skipped automatically when Docker isn't available locally.
 */

const dockerAvailable = ((): boolean => {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const describeE2E = dockerAvailable ? describe : describe.skip;

const QUEUE_NAME = 'e2e-test';

const validPayload = {
  adId: 'ad_001',
  tenantId: 'tenant_acme',
  violationType: 'PROHIBITED_TERM',
  severity: 'HIGH',
  detectedAt: '2026-05-21T14:23:01Z',
};

describeE2E('E2E · POST /webhook/violation → worker → GET /jobs/:id', () => {
  let redis: StartedTestContainer;
  let queue: Queue<ViolationPayload, TakedownResult>;
  let events: QueueEvents;
  let worker: Worker<ViolationPayload, TakedownResult>;
  let app: Express;
  let upstreamShouldFail = 0; /* 0 = success, N = failures before success */
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (): Promise<Response> => {
      if (upstreamShouldFail > 0) {
        upstreamShouldFail -= 1;
        return new Response('boom', { status: 503 });
      }
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    const connection = {
      host: redis.getHost(),
      port: redis.getMappedPort(6379),
      maxRetriesPerRequest: null as null,
    };

    ({ queue, events } = createViolationQueue(QUEUE_NAME, connection));
    worker = createTakedownWorker(QUEUE_NAME, connection, 5);
    await events.waitUntilReady();
    await worker.waitUntilReady();

    app = express();
    app.use(express.json());

    app.post('/webhook/violation', async (req, res) => {
      const parsed = violationPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      }
      const payload = parsed.data;
      const jobId = buildJobId(payload.adId, payload.tenantId);

      const existing = await queue.getJob(jobId);
      if (existing && isInFlight(await existing.getState())) {
        return res.status(200).json({
          jobId: String(existing.id),
          status: await existing.getState(),
          deduplicated: true,
        });
      }

      const job = await queue.add('takedown', payload, { jobId });
      return res.status(202).json({ jobId: String(job.id), status: 'queued' });
    });

    app.get('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'job id é obrigatório' });
      const job = await queue.getJob(id);
      if (!job) return res.status(404).json({ error: 'job não encontrado' });
      const state = await job.getState();
      return res.json({
        jobId: String(job.id),
        status: state,
        attempts: job.attemptsMade,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        result: job.returnvalue ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        error: job.failedReason ?? null,
      });
    });
  }, 60_000);

  afterAll(async () => {
    await worker.close();
    await events.close();
    await queue.close();
    await redis.stop();
    globalThis.fetch = originalFetch;
  }, 30_000);

  beforeEach(async () => {
    upstreamShouldFail = 0;
    await queue.obliterate({ force: true });
  });

  async function waitForState(jobId: string, expected: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await request(app).get(`/jobs/${jobId}`);
      if (res.body.status === expected) return;
      if (res.body.status === 'failed' && expected !== 'failed') {
        throw new Error(`job ${jobId} entered 'failed' unexpectedly: ${String(res.body.error)}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timeout esperando status=${expected} para ${jobId}`);
  }

  it('happy path: 202 → worker processa → completed com result', async () => {
    const enqueue = await request(app).post('/webhook/violation').send(validPayload);
    expect(enqueue.status).toBe(202);
    const jobId = enqueue.body.jobId as string;
    expect(jobId).toBe('tenant_acme__ad_001');

    await waitForState(jobId, 'completed');

    const status = await request(app).get(`/jobs/${jobId}`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ jobId, status: 'completed', attempts: 1 });
    expect(status.body.result).toMatchObject({
      upstreamStatus: 200,
      adId: 'ad_001',
      tenantId: 'tenant_acme',
    });
    expect(status.body.error).toBeNull();
  });

  it('retry: falha 2x e sucede na 3ª → completed com attempts=3', async () => {
    upstreamShouldFail = 2;
    const enqueue = await request(app).post('/webhook/violation').send(validPayload);
    expect(enqueue.status).toBe(202);
    const jobId = enqueue.body.jobId as string;

    await waitForState(jobId, 'completed', 30_000);

    const status = await request(app).get(`/jobs/${jobId}`);
    expect(status.body.status).toBe('completed');
    expect(status.body.attempts).toBe(3);
  });

  it('falha definitivamente após 3 tentativas → failed com error preenchido', async () => {
    upstreamShouldFail = 999;
    const enqueue = await request(app).post('/webhook/violation').send(validPayload);
    const jobId = enqueue.body.jobId as string;

    await waitForState(jobId, 'failed', 30_000);

    const status = await request(app).get(`/jobs/${jobId}`);
    expect(status.body.status).toBe('failed');
    expect(status.body.attempts).toBe(3);
    expect(status.body.error).toMatch(/upstream HTTP 503/);
    expect(status.body.result).toBeNull();
  });

  it('idempotência: dois POST simultâneos não criam dois jobs', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/webhook/violation').send(validPayload),
      request(app).post('/webhook/violation').send(validPayload),
    ]);

    expect(a.body.jobId).toBe(b.body.jobId);

    await waitForState(a.body.jobId as string, 'completed');
    const jobs = await queue.getJobs(['completed']);
    expect(jobs).toHaveLength(1);
  });

  it('idempotência sequencial: POST 2 enquanto job está active → 200 dedup', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = (async (): Promise<Response> => {
      await new Promise((r) => setTimeout(r, 300));
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as typeof fetch;
    try {
      const first = await request(app).post('/webhook/violation').send(validPayload);
      expect(first.status).toBe(202);

      const second = await request(app).post('/webhook/violation').send(validPayload);
      expect(second.status).toBe(200);
      expect(second.body.deduplicated).toBe(true);

      await waitForState(first.body.jobId as string, 'completed');
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('GET /jobs/:id retorna 404 quando o job não existe', async () => {
    const res = await request(app).get('/jobs/missing__job');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
