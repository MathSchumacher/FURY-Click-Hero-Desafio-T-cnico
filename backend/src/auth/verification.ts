import { createHash, randomBytes } from 'node:crypto';
import type { VerificationPurpose } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/**
 * Fluxo de tokens pra email verification + password reset.
 *
 * Princípios:
 *   - Tokens raw são `crypto.randomBytes(32).toString('base64url')` —
 *     mais entropia que precisamos (192 bits), URL-safe.
 *   - NUNCA armazenamos o token raw. Salvamos apenas SHA-256 dele —
 *     vazamento da tabela não compromete reset/verify em andamento.
 *   - Tokens são single-use (campo `usedAt`).
 *   - Após uso (ou erro), uma rotina de cleanup nightly pode purgar
 *     expirados/usados — index em `expiresAt` viabiliza.
 */

const VERIFY_EMAIL_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

export type IssuedToken = {
  /** Token raw — vai no link enviado por email. Após retornar, é descartado. */
  raw: string;
  /** ID do registro VerificationToken — usado em logs/audit, não no link. */
  id: string;
  expiresAt: Date;
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function ttlHoursFor(purpose: VerificationPurpose): number {
  return purpose === 'PASSWORD_RESET' ? PASSWORD_RESET_TTL_HOURS : VERIFY_EMAIL_TTL_HOURS;
}

/**
 * Cria novo token. Invalida tokens anteriores do mesmo propósito pro
 * mesmo user — UX: clicar "Reenviar email" não deixa o link antigo
 * funcionando + impede acúmulo de tokens válidos.
 */
export async function issueVerificationToken(
  userId: string,
  purpose: VerificationPurpose,
): Promise<IssuedToken> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlHoursFor(purpose) * 3600_000);

  /* Invalida outros tokens do mesmo propósito (não-usados, não-expirados). */
  await prisma.verificationToken.updateMany({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const created = await prisma.verificationToken.create({
    data: { userId, purpose, tokenHash, expiresAt },
  });

  return { raw, id: created.id, expiresAt };
}

/**
 * Consome token: valida + marca usedAt + retorna userId.
 * Null se token não existe, expirou, ou já foi usado.
 *
 * Operação não-atômica entre find e update — race condition baixíssima
 * (atacante precisaria do raw token + timing perfeito). Aceitável pro MVP.
 */
export async function consumeVerificationToken(
  rawToken: string,
  purpose: VerificationPurpose,
): Promise<string | null> {
  if (!rawToken || rawToken.length < 32) return null;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.usedAt !== null) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  await prisma.verificationToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.userId;
}

/**
 * Envia email com link.
 *
 * MVP: sempre logga (estruturado). Em prod, conectar com Resend/SendGrid/SES
 * via plugin — flag `EMAIL_SENDER_ENABLED=true` + provider config. Não bloqueia
 * o boot do backend se sender não está configurado.
 *
 * NUNCA logga o link em produção — só o `verificationId` pra correlação.
 */
type EmailKind = 'verify_email' | 'password_reset';

export function sendVerificationEmail(args: {
  to: string;
  kind: EmailKind;
  link: string;
  verificationId: string;
}): Promise<void> {
  const isProd = env.NODE_ENV === 'production';

  /* Em dev: logga o link inteiro pra DX (copie do log e abra no browser).
     Em prod: logga sem o link, esperando integração com Resend/SES no futuro. */
  if (isProd) {
    logger.info(
      { to: args.to, kind: args.kind, verificationId: args.verificationId },
      'email:sent (prod stub — TODO conectar provider)',
    );
  } else {
    logger.info(
      { to: args.to, kind: args.kind, link: args.link, verificationId: args.verificationId },
      'email:sent (dev mode — link no log)',
    );
  }
  return Promise.resolve();
}
