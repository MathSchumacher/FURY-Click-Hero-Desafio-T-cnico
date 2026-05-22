import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Testes do fluxo de tokens de verificação (email + password reset).
 *
 * Mocka Prisma + env (NODE_ENV) pra não depender do DB nem variar
 * comportamento de logger. Cobre os contratos críticos:
 *   - tokens raw têm entropia suficiente (length >= 32)
 *   - hash SHA-256 é o que vai pro DB (nunca o raw)
 *   - tokens antigos são invalidados ao emitir novo (idempotência)
 *   - consume é single-use (segunda chamada retorna null)
 *   - purpose precisa bater (token de PASSWORD_RESET não vale pra EMAIL_VERIFICATION)
 *   - expirados retornam null
 */

type FakeRow = {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  expiresAt: Date;
  usedAt: Date | null;
};

const fakeRows: FakeRow[] = [];
let seq = 0;

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    verificationToken: {
      create: async ({
        data,
      }: {
        data: Omit<FakeRow, 'id' | 'usedAt'> & { usedAt?: Date | null };
      }) => {
        const row: FakeRow = {
          id: `vt_${(seq += 1)}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          purpose: data.purpose,
          expiresAt: data.expiresAt,
          usedAt: data.usedAt ?? null,
        };
        fakeRows.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        fakeRows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeRow> }) => {
        const r = fakeRows.find((x) => x.id === where.id);
        if (!r) throw new Error('not found');
        Object.assign(r, data);
        return r;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          userId: string;
          purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
          usedAt: null;
          expiresAt: { gt: Date };
        };
        data: { usedAt: Date };
      }) => {
        let count = 0;
        for (const r of fakeRows) {
          if (
            r.userId === where.userId &&
            r.purpose === where.purpose &&
            r.usedAt === null &&
            r.expiresAt.getTime() > where.expiresAt.gt.getTime()
          ) {
            r.usedAt = data.usedAt;
            count++;
          }
        }
        return { count };
      },
    },
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:5173' },
}));

type Mod = typeof import('./verification.js');
let issueVerificationToken: Mod['issueVerificationToken'];
let consumeVerificationToken: Mod['consumeVerificationToken'];

beforeAll(async () => {
  ({ issueVerificationToken, consumeVerificationToken } = await import('./verification.js'));
});

beforeEach(() => {
  fakeRows.length = 0;
  seq = 0;
});

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

describe('issueVerificationToken', () => {
  it('retorna raw token com entropia suficiente (>= 32 chars base64url)', async () => {
    const t = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');
    expect(t.raw.length).toBeGreaterThanOrEqual(32);
    expect(t.raw).toMatch(/^[A-Za-z0-9_-]+$/); /* base64url charset */
  });

  it('grava apenas o hash SHA-256 — nunca o raw token', async () => {
    const t = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');
    expect(fakeRows[0]?.tokenHash).toBe(sha256(t.raw));
    expect(fakeRows[0]?.tokenHash).not.toBe(t.raw);
  });

  it('PASSWORD_RESET tem TTL 1h, EMAIL_VERIFICATION tem TTL 24h', async () => {
    const start = Date.now();
    const reset = await issueVerificationToken('u_1', 'PASSWORD_RESET');
    const verify = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');

    const resetTtlMs = reset.expiresAt.getTime() - start;
    const verifyTtlMs = verify.expiresAt.getTime() - start;

    /* tolerância de 1s pra clock jitter */
    expect(resetTtlMs).toBeGreaterThan(3600_000 - 1000);
    expect(resetTtlMs).toBeLessThan(3600_000 + 1000);
    expect(verifyTtlMs).toBeGreaterThan(24 * 3600_000 - 1000);
    expect(verifyTtlMs).toBeLessThan(24 * 3600_000 + 1000);
  });

  it('invalida tokens anteriores do mesmo propósito antes de criar novo', async () => {
    const t1 = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');
    const t2 = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');

    /* t1 deve estar marcado como usado */
    const r1 = fakeRows.find((r) => r.tokenHash === sha256(t1.raw));
    expect(r1?.usedAt).not.toBeNull();
    /* t2 ainda ativo */
    const r2 = fakeRows.find((r) => r.tokenHash === sha256(t2.raw));
    expect(r2?.usedAt).toBeNull();
  });

  it('NÃO invalida tokens de outro propósito', async () => {
    const verifyToken = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');
    await issueVerificationToken('u_1', 'PASSWORD_RESET');
    /* verifyToken não foi invalidado pelo issue de PASSWORD_RESET */
    const r = fakeRows.find((row) => row.tokenHash === sha256(verifyToken.raw));
    expect(r?.usedAt).toBeNull();
  });
});

describe('consumeVerificationToken', () => {
  it('retorna userId em token válido + não-usado + dentro do prazo', async () => {
    const t = await issueVerificationToken('u_42', 'EMAIL_VERIFICATION');
    const uid = await consumeVerificationToken(t.raw, 'EMAIL_VERIFICATION');
    expect(uid).toBe('u_42');
  });

  it('marca como usado após consume (single-use)', async () => {
    const t = await issueVerificationToken('u_1', 'PASSWORD_RESET');
    await consumeVerificationToken(t.raw, 'PASSWORD_RESET');
    const r = fakeRows.find((x) => x.tokenHash === sha256(t.raw));
    expect(r?.usedAt).not.toBeNull();
  });

  it('retorna null em segunda chamada (replay attack guard)', async () => {
    const t = await issueVerificationToken('u_1', 'PASSWORD_RESET');
    const first = await consumeVerificationToken(t.raw, 'PASSWORD_RESET');
    const second = await consumeVerificationToken(t.raw, 'PASSWORD_RESET');
    expect(first).toBe('u_1');
    expect(second).toBeNull();
  });

  it('retorna null quando purpose não bate', async () => {
    const t = await issueVerificationToken('u_1', 'EMAIL_VERIFICATION');
    const uid = await consumeVerificationToken(t.raw, 'PASSWORD_RESET');
    expect(uid).toBeNull();
  });

  it('retorna null em token expirado', async () => {
    const t = await issueVerificationToken('u_1', 'PASSWORD_RESET');
    /* força expiração */
    const r = fakeRows.find((x) => x.tokenHash === sha256(t.raw));
    if (r) r.expiresAt = new Date(Date.now() - 1000);
    const uid = await consumeVerificationToken(t.raw, 'PASSWORD_RESET');
    expect(uid).toBeNull();
  });

  it('retorna null em token inexistente / curto', async () => {
    expect(await consumeVerificationToken('', 'PASSWORD_RESET')).toBeNull();
    expect(await consumeVerificationToken('short', 'PASSWORD_RESET')).toBeNull();
    expect(
      await consumeVerificationToken(
        'nonexistent_but_long_enough_to_pass_length_check',
        'PASSWORD_RESET',
      ),
    ).toBeNull();
  });
});
