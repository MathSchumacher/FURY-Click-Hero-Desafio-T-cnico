import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testes pra GET /tenants/me e seus sub-recursos.
 *
 * Auth + Prisma são mockados. requireAuth real é importado de auth.ts,
 * mas a verificação do token é cortada — em vez disso, o teste injeta
 * req.auth direto via middleware fake antes de montar o router.
 */

type FakeTenant = { id: string; name: string; slug: string; createdAt: Date };
type FakeMembership = { userId: string; tenantId: string; role: string };
type FakeViolation = {
  id?: string;
  tenantId: string;
  adId?: string;
  violationType?: 'PROHIBITED_TERM' | 'BRAND_VIOLATION' | 'COMPLIANCE_FAIL';
  status: 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt?: Date;
};

const fakeTenants = new Map<string, FakeTenant>();
const fakeMemberships: FakeMembership[] = [];
const fakeViolations: FakeViolation[] = [];

function filterViolations(where: {
  tenantId: string;
  status?: string;
  severity?: string;
}): FakeViolation[] {
  return fakeViolations.filter((v) => {
    if (v.tenantId !== where.tenantId) return false;
    if (where.status && v.status !== where.status) return false;
    if (where.severity && v.severity !== where.severity) return false;
    return true;
  });
}

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => fakeTenants.get(where.id) ?? null,
    },
    membership: {
      findFirst: async ({ where }: { where: { userId: string; tenantId: string } }) =>
        fakeMemberships.find((m) => m.userId === where.userId && m.tenantId === where.tenantId) ??
        null,
    },
    violation: {
      count: async ({
        where,
      }: {
        where: { tenantId: string; status?: string; severity?: string };
      }) => filterViolations(where).length,
      groupBy: async ({
        by,
        where,
      }: {
        by: ('status' | 'severity')[];
        where: { tenantId: string };
      }) => {
        const filtered = filterViolations(where);
        const field = by[0]!;
        const counts = new Map<string, number>();
        for (const v of filtered) {
          const key = field === 'status' ? v.status : v.severity;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()].map(([k, n]) => ({
          [field]: k,
          _count: { _all: n },
        }));
      },
      findMany: async ({
        where,
        orderBy: _orderBy,
        take,
        skip,
      }: {
        where: { tenantId: string; status?: string; severity?: string };
        orderBy?: { createdAt: 'desc' };
        take?: number;
        skip?: number;
      }) => {
        const filtered = filterViolations(where).sort(
          (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        );
        return filtered.slice(skip ?? 0, (skip ?? 0) + (take ?? filtered.length));
      },
    },
  },
}));

/* Auth fake: substitui o requireAuth real pelo cookie-cutter pra teste */
vi.mock('./auth.js', async () => {
  const actual = await vi.importActual<typeof import('./auth.js')>('./auth.js');
  return {
    ...actual,
    requireAuth: (
      req: { auth?: unknown; header: (k: string) => string },
      _res: unknown,
      next: () => void,
    ) => {
      const h = req.header('x-test-auth');
      if (h) {
        try {
          (req as unknown as { auth: unknown }).auth = JSON.parse(h);
        } catch {
          /* ignore */
        }
      }
      next();
    },
  };
});

type RouterModule = typeof import('./tenants.js');
let tenantsRouter: RouterModule['tenantsRouter'];

beforeAll(async () => {
  ({ tenantsRouter } = await import('./tenants.js'));
});

beforeEach(() => {
  fakeTenants.clear();
  fakeMemberships.length = 0;
  fakeViolations.length = 0;
});

async function buildApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json());
  app.use(tenantsRouter);
  return app;
}

function authHeader(claims: { sub: string; tenantId: string; name?: string; email?: string }): {
  'x-test-auth': string;
} {
  return {
    'x-test-auth': JSON.stringify({
      sub: claims.sub,
      tenantId: claims.tenantId,
      name: claims.name ?? 'Test',
      email: claims.email ?? 'test@example.com',
    }),
  };
}

describe('GET /tenants/me', () => {
  it('401 quando não autenticado', async () => {
    const app = await buildApp();
    const res = await request(app).get('/tenants/me');
    expect(res.status).toBe(401);
  });

  it('200 com tenant info + role do membership', async () => {
    fakeTenants.set('t_acme', {
      id: 't_acme',
      name: 'Acme Moda',
      slug: 'acme-moda-abc123',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    fakeMemberships.push({ userId: 'u_1', tenantId: 't_acme', role: 'OWNER' });

    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 't_acme',
      name: 'Acme Moda',
      slug: 'acme-moda-abc123',
      role: 'OWNER',
    });
  });

  it('404 quando tenantId do token não existe mais no banco (defensivo)', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me')
      .set(authHeader({ sub: 'u_1', tenantId: 't_apagado' }));
    expect(res.status).toBe(404);
  });

  it('403 quando o user perdeu acesso ao tenant (membership removida)', async () => {
    fakeTenants.set('t_acme', {
      id: 't_acme',
      name: 'Acme',
      slug: 'acme-xxx',
      createdAt: new Date(),
    });
    /* Sem membership na lista — user não é mais membro */
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.status).toBe(403);
  });
});

describe('GET /tenants/me/stats', () => {
  beforeEach(() => {
    fakeTenants.set('t_acme', {
      id: 't_acme',
      name: 'Acme',
      slug: 'acme',
      createdAt: new Date(),
    });
    fakeMemberships.push({ userId: 'u_1', tenantId: 't_acme', role: 'OWNER' });
  });

  it('401 sem auth', async () => {
    const app = await buildApp();
    const res = await request(app).get('/tenants/me/stats');
    expect(res.status).toBe(401);
  });

  it('200 com counts zerados quando não há violations', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/stats')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      byStatus: { queued: 0, active: 0, completed: 0, failed: 0 },
      bySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    });
  });

  it('agrega corretamente por status e severity', async () => {
    fakeViolations.push(
      { tenantId: 't_acme', status: 'COMPLETED', severity: 'HIGH' },
      { tenantId: 't_acme', status: 'COMPLETED', severity: 'HIGH' },
      { tenantId: 't_acme', status: 'COMPLETED', severity: 'MEDIUM' },
      { tenantId: 't_acme', status: 'FAILED', severity: 'CRITICAL' },
      { tenantId: 't_acme', status: 'ACTIVE', severity: 'LOW' },
      { tenantId: 't_acme', status: 'QUEUED', severity: 'LOW' },
    );

    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/stats')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body).toEqual({
      total: 6,
      byStatus: { queued: 1, active: 1, completed: 3, failed: 1 },
      bySeverity: { LOW: 2, MEDIUM: 1, HIGH: 2, CRITICAL: 1 },
    });
  });

  it('NÃO vaza violations de outros tenants', async () => {
    fakeViolations.push(
      { tenantId: 't_acme', status: 'COMPLETED', severity: 'HIGH' },
      { tenantId: 't_outro', status: 'COMPLETED', severity: 'HIGH' },
      { tenantId: 't_outro', status: 'FAILED', severity: 'CRITICAL' },
    );

    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/stats')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.total).toBe(1);
    expect(res.body.byStatus.completed).toBe(1);
    expect(res.body.byStatus.failed).toBe(0);
  });
});

describe('GET /tenants/me/violations', () => {
  beforeEach(() => {
    fakeTenants.set('t_acme', {
      id: 't_acme',
      name: 'Acme',
      slug: 'acme',
      createdAt: new Date(),
    });
    fakeMemberships.push({ userId: 'u_1', tenantId: 't_acme', role: 'OWNER' });
    /* 25 violations com timestamps decrescentes pra testar pagination */
    for (let i = 0; i < 25; i++) {
      fakeViolations.push({
        id: `v_${i}`,
        tenantId: 't_acme',
        adId: `ad_${i}`,
        violationType: i % 2 === 0 ? 'PROHIBITED_TERM' : 'BRAND_VIOLATION',
        status: 'COMPLETED',
        severity: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const)[i % 4]!,
        createdAt: new Date(2026, 4, 22, 12, 0, 25 - i) /* mais recente primeiro */,
      });
    }
  });

  it('401 sem auth', async () => {
    const app = await buildApp();
    const res = await request(app).get('/tenants/me/violations');
    expect(res.status).toBe(401);
  });

  it('default: retorna primeiros 20 + total + page=1', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.items).toHaveLength(20);
    /* ordenado por createdAt desc — v_0 é o mais recente (createdAt máximo) */
    expect(res.body.items[0].adId).toBe('ad_0');
  });

  it('?page=2 retorna últimos 5 (25 - 20)', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?page=2')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(5);
  });

  it('?limit=5 respeita o limite (cap em 100)', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?limit=5')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.items).toHaveLength(5);
    expect(res.body.limit).toBe(5);
  });

  it('?limit acima de 100 é capado em 100 (DoS guard)', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?limit=9999')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.limit).toBe(100);
  });

  it('?severity=HIGH filtra só violations HIGH', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?severity=HIGH')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.items.every((v: { severity: string }) => v.severity === 'HIGH')).toBe(true);
    expect(res.body.total).toBeLessThan(25);
  });

  it('?status=completed filtra (mapeia lowercase → enum)', async () => {
    fakeViolations.push({
      tenantId: 't_acme',
      status: 'FAILED',
      severity: 'CRITICAL',
      adId: 'ad_x',
      createdAt: new Date(),
    });
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?status=failed')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].status).toBe('failed');
  });

  it('400 com severity inválida', async () => {
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations?severity=SEVERE')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/severity/i);
  });

  it('NÃO vaza violations de outros tenants', async () => {
    fakeViolations.push({
      tenantId: 't_outro',
      status: 'COMPLETED',
      severity: 'HIGH',
      adId: 'leaked',
      createdAt: new Date(),
    });
    const app = await buildApp();
    const res = await request(app)
      .get('/tenants/me/violations')
      .set(authHeader({ sub: 'u_1', tenantId: 't_acme' }));
    expect(res.body.items.every((v: { adId: string }) => v.adId !== 'leaked')).toBe(true);
  });
});
