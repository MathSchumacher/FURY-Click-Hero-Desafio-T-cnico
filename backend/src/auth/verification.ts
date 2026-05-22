import { createHash, randomBytes } from 'node:crypto';
import type { VerificationPurpose } from '@prisma/client';
import { Resend } from 'resend';
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

/** Cache do client Resend pra reusar conexão keep-alive entre requests. */
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return null;
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

const TEMPLATES: Record<EmailKind, (link: string) => { subject: string; html: string; text: string }> = {
  verify_email: (link) => ({
    subject: 'Confirme seu email — FURY',
    text: `Bem-vindo ao FURY. Confirme seu email abrindo: ${link}\n\nO link expira em 24h.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111;line-height:1.55">
  <h2 style="margin:0 0 12px;font-size:22px">Bem-vindo ao FURY</h2>
  <p style="margin:0 0 20px;color:#444">Confirme seu email pra ativar sua conta:</p>
  <a href="${link}" style="display:inline-block;padding:12px 24px;background:#ff3d2e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Confirmar email</a>
  <p style="margin:24px 0 0;font-size:13px;color:#666">O link expira em 24h. Se você não pediu isso, ignore.</p>
  <p style="margin:8px 0 0;font-size:11px;color:#999;word-break:break-all">Link bruto: ${link}</p>
</div>`,
  }),
  password_reset: (link) => ({
    subject: 'Redefinir senha — FURY',
    text: `Pedido de redefinição de senha. Acesse: ${link}\n\nO link expira em 1h e só pode ser usado uma vez. Se não foi você, ignore.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111;line-height:1.55">
  <h2 style="margin:0 0 12px;font-size:22px">Redefinir senha</h2>
  <p style="margin:0 0 20px;color:#444">Recebemos um pedido pra redefinir a senha da sua conta FURY:</p>
  <a href="${link}" style="display:inline-block;padding:12px 24px;background:#ff3d2e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Definir nova senha</a>
  <p style="margin:24px 0 0;font-size:13px;color:#666">O link expira em 1 hora e só funciona uma vez. Se você não pediu, pode ignorar — sua senha atual continua válida.</p>
  <p style="margin:8px 0 0;font-size:11px;color:#999;word-break:break-all">Link bruto: ${link}</p>
</div>`,
  }),
};

/**
 * Envia email transactional via Resend.
 *
 * Se RESEND_API_KEY + RESEND_FROM não estão setados, cai em "dev mode" —
 * apenas logga o link estruturado (útil pra debug local + ambientes sem
 * provider conectado). Em prod com provider configurado, envia de verdade
 * + logga o messageId pra trace.
 *
 * Best-effort: falha de envio NÃO derruba o request — o token já foi
 * gerado e gravado. User pode pedir reenvio se não chegar.
 */
export async function sendVerificationEmail(args: {
  to: string;
  kind: EmailKind;
  link: string;
  verificationId: string;
}): Promise<void> {
  const client = getResend();

  if (!client) {
    logger.info(
      { to: args.to, kind: args.kind, link: args.link, verificationId: args.verificationId },
      'email:sent (dev mode — sem RESEND_API_KEY, link no log)',
    );
    return;
  }

  const tpl = TEMPLATES[args.kind](args.link);
  /* `getResend()` valida `RESEND_FROM` antes de retornar — aqui é seguro. */
  const from = env.RESEND_FROM ?? '';

  try {
    const result = await client.emails.send({
      from,
      to: args.to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
    logger.info(
      {
        to: args.to,
        kind: args.kind,
        verificationId: args.verificationId,
        messageId: result.data.id,
      },
      'email:sent',
    );
  } catch (err) {
    logger.error(
      { err: (err as Error).message, to: args.to, kind: args.kind, verificationId: args.verificationId },
      'email:send_failed',
    );
  }
}
