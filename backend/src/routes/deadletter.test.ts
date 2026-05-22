import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /jobs/failed agora exige auth + lê do Postgres (Violation com
 * status=FAILED filtradas pelo tenantId do user logado). Evita vazamento
 * cross-tenant de stack traces que vinha do BullMQ queue global.
 */

type FakeFailed = {
  jobId: string;
  tenantId: string;
  adId: string;
  severity: string;
  violationType: string;
  attempts: number;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

const fakeFailed: FakeFailed[] = [];

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    violation: {
      findMany: async ({
        where,
        take,
      }: {
        where: { tenantId: string; status: string };
        take: number;
      }) => {
        if (where.status !== 'FAILED') return [];
        return fakeFailed.filter((f) => f.tenantId === where.tenantId).slice(0, take);
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

type RouterModule = typeof import('./deadletter.js');
let deadLetterRouter: RouterModule['deadLetterRouter'];

beforeAll(async () => {
  ({ deadLetterRouter } = await import('./deadletter.js'));
});

beforeEach(() => {
  fakeFailed.length = 0;
});

async function buildApp(): Promise<express.Express> {
  const app = express();
  app.use(deadLetterRouter);
  return app;
}

function authHeader(tenantId: string): { 'x-test-auth': string } {
  return {
    'x-test-auth': JSON.stringify({ sub: 'u_1', tenantId, name: 'T', email: 't@t.com' }),
  };
}

describe('GET /jobs/failed', () => {
  it('401 sem auth', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/failed');
    expect(res.status).toBe(401);
  });

  it('200 com lista vazia quando não há jobs failed', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/failed').set(authHeader('t_a'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, jobs: [] });
  });

  it('retorna jobs com shape { jobId, attempts, error, adId, severity, ... }', async () => {
    fakeFailed.push({
      jobId: 't_a__ad_1',
      tenantId: 't_a',
      adId: 'ad_1',
      severity: 'CRITICAL',
      violationType: 'PROHIBITED_TERM',
      attempts: 3,
      errorMessage: 'upstream HTTP 503',
      createdAt: new Date(1700000000000),
      finishedAt: new Date(1700000005000),
    });

    const app = await buildApp();
    const res = await request(app).get('/jobs/failed').set(authHeader('t_a'));
    expect(res.body.total).toBe(1);
    expect(res.body.jobs[0]).toMatchObject({
      jobId: 't_a__ad_1',
      adId: 'ad_1',
      severity: 'CRITICAL',
      attempts: 3,
      error: 'upstream HTTP 503',
    });
    expect(res.body.jobs[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.jobs[0].finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('NÃO vaza failures de outros tenants', async () => {
    fakeFailed.push({
      jobId: 't_a__ad_1',
      tenantId: 't_a',
      adId: 'ad_1',
      severity: 'HIGH',
      violationType: 'PROHIBITED_TERM',
      attempts: 3,
      errorMessage: 'mine',
      createdAt: new Date(),
      finishedAt: null,
    });
    fakeFailed.push({
      jobId: 't_b__ad_1',
      tenantId: 't_b',
      adId: 'ad_1',
      severity: 'HIGH',
      violationType: 'PROHIBITED_TERM',
      attempts: 3,
      errorMessage: 'NOT MINE',
      createdAt: new Date(),
      finishedAt: null,
    });

    const app = await buildApp();
    const res = await request(app).get('/jobs/failed').set(authHeader('t_a'));
    expect(res.body.total).toBe(1);
    expect(res.body.jobs[0].error).toBe('mine');
  });

  it('aceita ?limit=N (default 50, máx 200)', async () => {
    for (let i = 0; i < 60; i++) {
      fakeFailed.push({
        jobId: `t_a__ad_${i}`,
        tenantId: 't_a',
        adId: `ad_${i}`,
        severity: 'LOW',
        violationType: 'PROHIBITED_TERM',
        attempts: 3,
        errorMessage: 'x',
        createdAt: new Date(),
        finishedAt: null,
      });
    }
    const app = await buildApp();

    const def = await request(app).get('/jobs/failed').set(authHeader('t_a'));
    expect(def.body.jobs).toHaveLength(50);

    const small = await request(app).get('/jobs/failed?limit=5').set(authHeader('t_a'));
    expect(small.body.jobs).toHaveLength(5);

    const overcap = await request(app).get('/jobs/failed?limit=999').set(authHeader('t_a'));
    expect(overcap.body.jobs).toHaveLength(60); /* cap=200 mas só temos 60 */
  });

  it('400 quando ?limit não é número positivo', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/failed?limit=abc').set(authHeader('t_a'));
    expect(res.status).toBe(400);
  });
});
