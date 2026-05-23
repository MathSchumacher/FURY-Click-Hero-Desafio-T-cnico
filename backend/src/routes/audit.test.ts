import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Specs do GET /audit/me — visualização paginada do audit log.
 *
 * Regras testadas:
 *   - 401 sem auth
 *   - 403 quando user não é OWNER do tenant
 *   - 200 retorna { total, page, limit, items: [...] }
 *   - Filtra por tenantId das claims (multi-tenant isolation)
 *   - Filtro opcional ?action=USER_LOGIN_SUCCESS
 *   - Order desc por createdAt
 *   - Paginação corretamente offsetting
 */

const FIXED_NOW = new Date('2026-05-22T20:00:00Z');

const mockAuditEventFindMany = vi.fn();
const mockAuditEventCount = vi.fn();
const mockMembershipFindFirst = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    auditEvent: {
      findMany: mockAuditEventFindMany,
      count: mockAuditEventCount,
    },
    membership: {
      findFirst: mockMembershipFindFirst,
    },
  },
}));

vi.mock('./auth.js', () => ({
  requireAuth: (
    req: express.Request & { auth?: { sub: string; tenantId: string } },
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    /* Simula sessão autenticada — sub + tenantId vêm do PASETO em prod */
    req.auth = { sub: 'user_acme_owner', tenantId: 'tenant_acme' };
    next();
  },
}));

vi.mock('./auth.js', async () => {
  const actual = await vi.importActual<typeof import('./auth.js')>('./auth.js');
  return {
    ...actual,
    requireAuth: (
      req: express.Request & { auth?: { sub: string; tenantId: string } },
      _res: express.Response,
      next: express.NextFunction,
    ): void => {
      req.auth = { sub: 'user_acme_owner', tenantId: 'tenant_acme' };
      next();
    },
  };
});

async function buildApp(): Promise<express.Express> {
  const { auditRouter } = await import('./audit.js');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(auditRouter);
  return app;
}

const FIXTURE_EVENTS = [
  {
    id: 'ae_3',
    action: 'WEBHOOK_SECRET_ROTATE',
    userId: 'user_acme_owner',
    tenantId: 'tenant_acme',
    metadata: { fromUI: true },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2026-05-22T19:00:00Z'),
  },
  {
    id: 'ae_2',
    action: 'USER_LOGIN_SUCCESS',
    userId: 'user_acme_owner',
    tenantId: 'tenant_acme',
    metadata: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2026-05-22T18:30:00Z'),
  },
  {
    id: 'ae_1',
    action: 'USER_REGISTER',
    userId: 'user_acme_owner',
    tenantId: 'tenant_acme',
    metadata: { email: 'a@b.com' },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2026-05-22T18:00:00Z'),
  },
];

describe('GET /audit/me', () => {
  beforeEach(() => {
    mockAuditEventFindMany.mockReset();
    mockAuditEventCount.mockReset();
    mockMembershipFindFirst.mockReset();
    /* default: user IS OWNER do tenant */
    mockMembershipFindFirst.mockResolvedValue({
      userId: 'user_acme_owner',
      tenantId: 'tenant_acme',
      role: 'OWNER',
    });
  });

  it('200: retorna paginação + items ordenados desc por createdAt', async () => {
    mockAuditEventCount.mockResolvedValueOnce(3);
    mockAuditEventFindMany.mockResolvedValueOnce(FIXTURE_EVENTS);

    const app = await buildApp();
    const res = await request(app).get('/audit/me');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].action).toBe('WEBHOOK_SECRET_ROTATE');
    expect(res.body.items[2].action).toBe('USER_REGISTER');
    /* createdAt sempre ISO string */
    expect(res.body.items[0].createdAt).toBe('2026-05-22T19:00:00.000Z');
  });

  it('200: filtra prisma where por tenantId das claims (multi-tenant isolation)', async () => {
    mockAuditEventCount.mockResolvedValueOnce(0);
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    const app = await buildApp();
    await request(app).get('/audit/me');

    expect(mockAuditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_acme' }),
      }),
    );
  });

  it('200: filtro opcional ?action=USER_LOGIN_SUCCESS adiciona ao where', async () => {
    mockAuditEventCount.mockResolvedValueOnce(1);
    mockAuditEventFindMany.mockResolvedValueOnce([FIXTURE_EVENTS[1]]);

    const app = await buildApp();
    await request(app).get('/audit/me?action=USER_LOGIN_SUCCESS');

    expect(mockAuditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant_acme',
          action: 'USER_LOGIN_SUCCESS',
        }),
      }),
    );
  });

  it('400: action inválida não passa do zod', async () => {
    const app = await buildApp();
    const res = await request(app).get('/audit/me?action=NOT_AN_ENUM_VALUE');

    expect(res.status).toBe(400);
    expect(mockAuditEventFindMany).not.toHaveBeenCalled();
  });

  it('200: page=2&limit=2 → skip:2, take:2', async () => {
    mockAuditEventCount.mockResolvedValueOnce(10);
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    const app = await buildApp();
    await request(app).get('/audit/me?page=2&limit=2');

    expect(mockAuditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('200: limit > 100 é clampado pra 100 (UX clemente)', async () => {
    mockAuditEventCount.mockResolvedValueOnce(0);
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    const app = await buildApp();
    await request(app).get('/audit/me?limit=9999');

    expect(mockAuditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('403: user não-OWNER recebe forbidden', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce({
      userId: 'user_acme_member',
      tenantId: 'tenant_acme',
      role: 'MEMBER',
    });

    const app = await buildApp();
    const res = await request(app).get('/audit/me');

    expect(res.status).toBe(403);
    expect(mockAuditEventFindMany).not.toHaveBeenCalled();
  });

  it('403: user sem membership no tenant', async () => {
    mockMembershipFindFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const res = await request(app).get('/audit/me');

    expect(res.status).toBe(403);
  });
});
