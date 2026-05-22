import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /jobs/:id agora exige auth + scope ao tenant do user logado.
 * Eleva acima do spec original do desafio (que permitia público) pra
 * produção real — impede IDOR via jobId determinístico.
 *
 * Contrato preservado: { jobId, status, attempts, result, error }.
 * Status é o domain enum lowercase (queued/active/completed/failed).
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

const fakeViolations: FakeViolation[] = [];

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    violation: {
      findFirst: async ({ where }: { where: { jobId: string; tenantId?: string } }) => {
        return (
          fakeViolations.find(
            (v) =>
              v.jobId === where.jobId &&
              (where.tenantId === undefined || v.tenantId === where.tenantId),
          ) ?? null
        );
      },
    },
  },
}));

vi.mock('./auth.js', async () => {
  const actual = await vi.importActual<typeof import('./auth.js')>('./auth.js');
  return {
    ...actual,
    requireAuth: (
      req: { auth?: unknown; header: (k: string) => string },
      res: { status: (n: number) => { json: (b: unknown) => void } },
      next: () => void,
    ) => {
      const h = req.header('x-test-auth');
      if (!h) {
        res.status(401).json({ error: 'não autenticado' });
        return;
      }
      try {
        (req as unknown as { auth: unknown }).auth = JSON.parse(h);
        next();
      } catch {
        res.status(401).json({ error: 'token inválido' });
      }
    },
  };
});

type RouterModule = typeof import('./jobs.js');
let jobsRouter: RouterModule['jobsRouter'];

beforeAll(async () => {
  ({ jobsRouter } = await import('./jobs.js'));
});

beforeEach(() => {
  fakeViolations.length = 0;
});

async function buildApp(): Promise<express.Express> {
  const app = express();
  app.use(jobsRouter);
  return app;
}

function authHeader(tenantId: string, sub = 'u_1'): { 'x-test-auth': string } {
  return {
    'x-test-auth': JSON.stringify({
      sub,
      tenantId,
      name: 'Test',
      email: 'test@example.com',
    }),
  };
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
  it('401 sem auth', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/anything');
    expect(res.status).toBe(401);
  });

  it('404 quando job não existe no tenant do user', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/nope').set(authHeader('t_1'));
    expect(res.status).toBe(404);
  });

  it('404 (não 200) quando job pertence a OUTRO tenant (IDOR guard)', async () => {
    fakeViolations.push(
      makeViolation({
        jobId: 't_alheio__ad_42',
        status: 'COMPLETED',
        tenantId: 't_alheio',
      }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/t_alheio__ad_42').set(authHeader('t_1'));
    expect(res.status).toBe(404); /* nem confirma existência — privacy by default */
  });

  it('shape { jobId, status, attempts, result, error } pra job completed do meu tenant', async () => {
    fakeViolations.push(
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
    const res = await request(app)
      .get('/jobs/tenant_t__ad_42')
      .set(authHeader('tenant_t'));
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
    fakeViolations.push(
      makeViolation({
        jobId: 'tenant_t__ad_42',
        tenantId: 'tenant_t',
        status: 'FAILED',
        attempts: 3,
        errorMessage: 'upstream HTTP 503',
      }),
    );
    const app = await buildApp();
    const res = await request(app)
      .get('/jobs/tenant_t__ad_42')
      .set(authHeader('tenant_t'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'failed',
      attempts: 3,
      result: null,
      error: 'upstream HTTP 503',
    });
  });

  it('shape pra job queued: result=null, error=null, attempts=0', async () => {
    fakeViolations.push(
      makeViolation({ jobId: 'tenant_t__ad_42', tenantId: 'tenant_t', status: 'QUEUED' }),
    );
    const app = await buildApp();
    const res = await request(app)
      .get('/jobs/tenant_t__ad_42')
      .set(authHeader('tenant_t'));
    expect(res.body).toMatchObject({
      status: 'queued',
      attempts: 0,
      result: null,
      error: null,
    });
  });
});
