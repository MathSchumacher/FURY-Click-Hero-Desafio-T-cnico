import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Specs do POST /auth/change-password.
 *
 * Regras:
 *   - Requer auth (cookie ou bearer)
 *   - Requer CSRF token (state-changing)
 *   - Body: { currentPassword, newPassword } via zod
 *   - currentPassword precisa bater com hash atual (bcrypt.compare)
 *   - newPassword vira hash bcrypt cost=12
 *   - Audit USER_PASSWORD_CHANGE gravado
 *   - 200 sucesso · 401 senha errada · 400 payload inválido
 *   - Conta OAuth-only (passwordHash=null) → 400 "use reset-password"
 */

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
    auditEvent: {
      create: mockAuditCreate,
    },
  },
}));

vi.mock('./auth.js', async () => {
  const actual = await vi.importActual<typeof import('./auth.js')>('./auth.js');
  return {
    ...actual,
    requireAuth: (
      req: express.Request & { auth?: { sub: string; tenantId: string; email: string } },
      _res: express.Response,
      next: express.NextFunction,
    ): void => {
      req.auth = { sub: 'user_1', tenantId: 'tenant_acme', email: 'me@a.com' };
      next();
    },
  };
});

/* Mock do CSRF middleware pra simular header válido */
vi.mock('../auth/csrf.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/csrf.js')>('../auth/csrf.js');
  return {
    ...actual,
    /* No-op CSRF — testamos a integration de CSRF noutro file */
    csrfProtection: (_req: express.Request, _res: express.Response, next: express.NextFunction): void => {
      next();
    },
  };
});

async function buildApp(): Promise<express.Express> {
  const { changePasswordRouter } = await import('./changePassword.js');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(changePasswordRouter);
  return app;
}

const CURRENT_HASH_OF_RIGHT = '$2a$10$8GqJp3I0lYqcVeM4Pz9Lk.fakehash.for.unit.test.only';

describe('POST /auth/change-password', () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockAuditCreate.mockReset();
    mockAuditCreate.mockResolvedValue({ id: 'ae_x' });
  });

  it('200: muda senha quando current password bate', async () => {
    /* Gera hash real do "right-password" pra bcrypt.compare passar */
    const realHash = await bcrypt.hash('right-password', 10);
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'me@a.com',
      passwordHash: realHash,
    });
    mockUserUpdate.mockResolvedValueOnce({ id: 'user_1' });

    const app = await buildApp();
    const res = await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: 'right-password', newPassword: 'new-strong-password-8+' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          /* passwordHash deve ser uma string bcrypt nova (não a antiga) */
          passwordHash: expect.stringMatching(/^\$2[ab]\$12\$/),
        }),
      }),
    );
  });

  it('200: grava audit USER_PASSWORD_CHANGE', async () => {
    const realHash = await bcrypt.hash('right-password', 10);
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'me@a.com',
      passwordHash: realHash,
    });
    mockUserUpdate.mockResolvedValueOnce({ id: 'user_1' });

    const app = await buildApp();
    await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: 'right-password', newPassword: 'new-strong-password-8+' });

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_PASSWORD_CHANGE',
          userId: 'user_1',
          tenantId: 'tenant_acme',
        }),
      }),
    );
  });

  it('401: senha atual errada — não muda + audita tentativa falha', async () => {
    const realHash = await bcrypt.hash('actual-password', 10);
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'me@a.com',
      passwordHash: realHash,
    });

    const app = await buildApp();
    const res = await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: 'wrong-guess', newPassword: 'new-strong-password-8+' });

    expect(res.status).toBe(401);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    /* Auditamos a tentativa falha como USER_LOGIN_FAIL com reason
       específico — útil pra detectar session hijacking ou bruteforce. */
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_LOGIN_FAIL',
          metadata: expect.objectContaining({ reason: 'change_password_wrong_current' }),
        }),
      }),
    );
  });

  it('400: newPassword < 8 chars', async () => {
    const realHash = await bcrypt.hash('right-password', 10);
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'me@a.com',
      passwordHash: realHash,
    });

    const app = await buildApp();
    const res = await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: 'right-password', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('400: body sem currentPassword', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/auth/change-password')
      .send({ newPassword: 'new-strong-password-8+' });

    expect(res.status).toBe(400);
  });

  it('400: conta OAuth-only (passwordHash=null) → mensagem clara', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'me@a.com',
      passwordHash: null,
    });

    const app = await buildApp();
    const res = await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: 'anything', newPassword: 'new-strong-password-8+' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/oauth|reset/i);
  });
});
