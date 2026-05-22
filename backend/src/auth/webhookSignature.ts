import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * HMAC signature pra webhook receiver.
 *
 * Padrão: header `X-FURY-Signature: sha256=<hex>` onde `<hex>` é
 * HMAC-SHA256(raw_body, tenant_secret). Igual ao que Stripe, GitHub,
 * Slack e outros usam — protege contra:
 *   - Forgery: atacante sem secret não consegue produzir assinatura válida
 *   - Tampering: qualquer mudança no body invalida o HMAC
 *   - Replay parcial: combinado com timestamp + window seria total guard,
 *     mas pra escopo do desafio mantemos só body+secret
 *
 * Secret é gerado por tenant no register e fica disponível via
 * /tenants/me/webhook-secret (apenas pro OWNER). Rotação via endpoint
 * dedicado pra suportar key rotation sem downtime.
 */

export const WEBHOOK_SIGNATURE_HEADER = 'x-fury-signature';

const HEADER_PREFIX = 'sha256=';

/** Gera secret 32-byte base64url (256 bits entropia). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Calcula HMAC-SHA256 do body com o secret. Retorna hex lowercase. */
export function computeSignature(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Verifica header `sha256=<hex>` contra HMAC esperado.
 * Comparison timing-safe pra evitar timing attack na descoberta da assinatura.
 */
export function verifySignature(
  rawBody: string | Buffer,
  headerValue: string | undefined,
  secret: string,
): boolean {
  if (!headerValue || !secret) return false;
  if (!headerValue.startsWith(HEADER_PREFIX)) return false;
  const provided = headerValue.slice(HEADER_PREFIX.length).toLowerCase();
  const expected = computeSignature(rawBody, secret);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
