import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for POST /webhook/violation.
 *
 * Queue + Prisma fakes em memória. Asseguramos contrato + idempotência
 * race-free (Prisma unique constraint como atomic primitive).
 */

type FakeJob = {
  id: string;
  state: 'waiting' | 'active' | 'delayed' | 'waiting-children' | 'completed' | 'failed';
  data: unknown;
  opts: unknown;
  getState: () => Promise<string>;
};

type FakeViolation = {
  tenantId: string;
  jobId: string;
  adId: string;
  violationType: string;
  severity: string;
  status: 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  detectedAt: Date;
};

class FakePrismaUniqueError extends Error {
  code = 'P2002';
  meta = { target: ['tenantId', 'jobId'] };
  constructor() {
    super('Unique constraint failed');
    this.name = 'PrismaClientKnownRequestError';
  }
}

const fakeJobs: Map<string, FakeJob> = new Map();
const fakeTenants: Map<string, { id: string; slug: string }> = new Map();
const fakeViolations: Map<string, FakeViolation> = new Map(); /* key = `${tenantId}|${jobId}` */
const violationCreateSpy = vi.fn();
const violationUpdateSpy = vi.fn();

function violationKey(tenantId: string, jobId: string): string {
  return `${tenantId}|${jobId}`;
}

vi.mock('../queue/violationQueue.js', async () => {
  const jobOptions =
    await vi.importActual<typeof import('../queue/jobOptions.js')>('../queue/jobOptions.js');
  return {
    ...jobOptions,
    QUEUE_NAME: 'test-queue',
    violationQueue: {
      add: async (_name: string, data: unknown, opts: { jobId: string }): Promise<FakeJob> => {
        const existing = fakeJobs.get(opts.jobId);
        if (existing) return existing; /* BullMQ-like: idempotent por jobId */
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

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenant: {
      findFirst: async ({ where }: { where: { OR: { id?: string; slug?: string }[] } }) => {
        for (const clause of where.OR) {
          const key = clause.id ?? clause.slug;
          if (typeof key === 'string') {
            const found = fakeTenants.get(key);
            if (found) return found;
          }
        }
        return null;
      },
    },
    violation: {
      create: async (args: { data: FakeViolation }) => {
        violationCreateSpy(args);
        const key = violationKey(args.data.tenantId, args.data.jobId);
        if (fakeViolations.has(key)) throw new FakePrismaUniqueError();
        fakeViolations.set(key, args.data);
        return args.data;
      },
      findUnique: async ({
        where,
      }: {
        where: { tenantId_jobId: { tenantId: string; jobId: string } };
      }) => fakeViolations.get(violationKey(where.tenantId_jobId.tenantId, where.tenantId_jobId.jobId)) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { tenantId_jobId: { tenantId: string; jobId: string } };
        data: Partial<FakeViolation>;
      }) => {
        violationUpdateSpy({ where, data });
        const key = violationKey(where.tenantId_jobId.tenantId, where.tenantId_jobId.jobId);
        const v = fakeViolations.get(key);
        if (!v) throw new Error('not found');
        Object.assign(v, data);
        return v;
      },
    },
  },
}));

beforeEach(() => {
  fakeJobs.clear();
  fakeTenants.clear();
  fakeViolations.clear();
  violationCreateSpy.mockClear();
  violationUpdateSpy.mockClear();
  fakeTenants.set('tenant_t', { id: 'tenant_t', slug: 'tenant_t' });
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

function seedExistingViolation(
  tenantId: string,
  jobId: string,
  status: FakeViolation['status'] = 'QUEUED',
): void {
  fakeViolations.set(violationKey(tenantId, jobId), {
    tenantId,
    jobId,
    adId: jobId.split('__')[1] ?? '',
    violationType: 'PROHIBITED_TERM',
    severity: 'HIGH',
    status,
    detectedAt: new Date(),
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
      jobId: 'tenant_t__ad_42',
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

  it('200 + deduplicated:true quando Violation existente está QUEUED', async () => {
    seedExistingViolation('tenant_t', 'tenant_t__ad_42', 'QUEUED');
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: 'tenant_t__ad_42',
      deduplicated: true,
    });
  });

  it('200 + deduplicated:true quando Violation existente está ACTIVE', async () => {
    seedExistingViolation('tenant_t', 'tenant_t__ad_42', 'ACTIVE');
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.deduplicated).toBe(true);
  });

  it('202 (re-enqueue) quando Violation anterior está COMPLETED → reseta pra QUEUED', async () => {
    seedExistingViolation('tenant_t', 'tenant_t__ad_42', 'COMPLETED');
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
    /* DB deve ter sido atualizada pra QUEUED, não criada do zero */
    expect(violationUpdateSpy).toHaveBeenCalled();
    expect(violationCreateSpy).toHaveBeenCalledTimes(1); /* tentou criar, falhou com unique, daí update */
  });

  it('202 (re-enqueue) quando Violation anterior está FAILED', async () => {
    seedExistingViolation('tenant_t', 'tenant_t__ad_42', 'FAILED');
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
  });

  it('rejeita campos extras (schema .strict())', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, extra: 'foo' });
    expect(res.status).toBe(400);
  });

  it('404 com field=tenantId quando tenantId não existe no DB', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, tenantId: 'tenant_inexistente' });
    expect(res.status).toBe(404);
    expect(res.body.field).toBe('tenantId');
    expect(res.body.error).toMatch(/tenant_inexistente/);
  });

  it('grava Violation no banco via create (atomic) com status QUEUED', async () => {
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
    expect(violationCreateSpy).toHaveBeenCalledTimes(1);
    const call = violationCreateSpy.mock.calls[0]?.[0] as { data: FakeViolation };
    expect(call.data.status).toBe('QUEUED');
    expect(call.data.adId).toBe('ad_42');
    expect(call.data.jobId).toBe('tenant_t__ad_42');
  });

  it('race condition: 2 requests simultâneos resolvem corretamente (1 cria + 1 dedup)', async () => {
    const app = await buildApp();
    /* Dispara em paralelo. O primeiro a chegar no Prisma cria; o segundo
       pega P2002 unique constraint e cai no caminho de dedup. */
    const [a, b] = await Promise.all([
      request(app).post('/webhook/violation').send(validPayload),
      request(app).post('/webhook/violation').send(validPayload),
    ]);
    /* Pelo menos um 202 (quem criou) e pelo menos um 200 (dedup),
       garantindo que NÃO virou dois 202. */
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 202]);
    /* DB tem apenas 1 row */
    expect(fakeViolations.size).toBe(1);
  });

  it('aceita tenantId por slug E por id (ambos resolvem o mesmo tenant)', async () => {
    fakeTenants.set('cuid_acme_xxx', { id: 'cuid_acme_xxx', slug: 'acme' });
    fakeTenants.set('acme', { id: 'cuid_acme_xxx', slug: 'acme' });
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, tenantId: 'acme' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe('cuid_acme_xxx__ad_42');
  });
});
