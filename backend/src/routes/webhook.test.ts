import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for POST /webhook/violation.
 *
 * Queue + Prisma são substituídos por fakes em memória pra rodar sem
 * Redis nem Postgres. Asseguramos o contrato da rota: status codes,
 * shape do response, validação Zod, idempotência E persistência da
 * Violation no banco.
 */

type FakeJob = {
  id: string;
  state: 'waiting' | 'active' | 'delayed' | 'waiting-children' | 'completed' | 'failed';
  data: unknown;
  opts: unknown;
  getState: () => Promise<string>;
};

const fakeJobs: Map<string, FakeJob> = new Map();
const fakeTenants: Map<string, { id: string; slug: string }> = new Map();
const violationUpsertSpy = vi.fn();

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

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenant: {
      findFirst: async ({ where }: { where: { OR: { id?: string; slug?: string }[] } }) => {
        const ors = where.OR;
        for (const clause of ors) {
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
      upsert: (args: unknown) => {
        violationUpsertSpy(args);
        return Promise.resolve({});
      },
    },
  },
}));

beforeEach(() => {
  fakeJobs.clear();
  fakeTenants.clear();
  violationUpsertSpy.mockClear();
  /* Tenant fake usado por quase todos os testes — slug E id batem com
     o payload.tenantId pra que o jobId resolvido fique determinístico. */
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

  it('200 + deduplicated:true quando job já está in-flight (waiting)', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t__ad_42', 'waiting');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: 'tenant_t__ad_42',
      deduplicated: true,
      status: 'waiting',
    });
  });

  it('200 + deduplicated:true quando job está active', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t__ad_42', 'active');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.deduplicated).toBe(true);
  });

  it('202 (novo job) quando job anterior está completed', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t__ad_42', 'completed');
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

  /* ── Novos comportamentos da Fase 1.4: tenant validation + DB write ── */

  it('404 com field=tenantId quando tenantId não existe no DB', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, tenantId: 'tenant_inexistente' });
    expect(res.status).toBe(404);
    expect(res.body.field).toBe('tenantId');
    expect(res.body.error).toMatch(/tenant_inexistente/);
  });

  it('grava Violation no banco com status QUEUED quando enfileira novo job', async () => {
    const app = await buildApp();
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(202);
    expect(violationUpsertSpy).toHaveBeenCalledTimes(1);
    const call = violationUpsertSpy.mock.calls[0]?.[0] as {
      where: { tenantId_jobId: { tenantId: string; jobId: string } };
      create: { tenantId: string; jobId: string; status: string; adId: string };
    };
    expect(call.where.tenantId_jobId).toEqual({
      tenantId: 'tenant_t',
      jobId: 'tenant_t__ad_42',
    });
    expect(call.create.status).toBe('QUEUED');
    expect(call.create.adId).toBe('ad_42');
  });

  it('NÃO grava Violation duplicada quando request é deduplicado', async () => {
    const app = await buildApp();
    seedInFlightJob('tenant_t__ad_42', 'waiting');
    const res = await request(app).post('/webhook/violation').send(validPayload);
    expect(res.status).toBe(200);
    expect(violationUpsertSpy).not.toHaveBeenCalled();
  });

  it('aceita tenantId por slug E por id (ambos resolvem o mesmo tenant)', async () => {
    fakeTenants.set('cuid_acme_xxx', { id: 'cuid_acme_xxx', slug: 'acme' });
    fakeTenants.set('acme', { id: 'cuid_acme_xxx', slug: 'acme' });
    const app = await buildApp();
    /* Envio pelo slug "acme" */
    const res = await request(app)
      .post('/webhook/violation')
      .send({ ...validPayload, tenantId: 'acme' });
    expect(res.status).toBe(202);
    /* jobId deve usar tenant.id resolvido (cuid_acme_xxx), não o slug */
    expect(res.body.jobId).toBe('cuid_acme_xxx__ad_42');
  });
});
