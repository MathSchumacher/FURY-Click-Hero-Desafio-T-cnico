import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Rate limiters por categoria de endpoint. Defaults conservadores —
 * podem ser afrouxados via env quando o produto tiver volume conhecido.
 *
 * Implementação em memória (in-process). Pra múltiplas instâncias do
 * backend, trocar `store` por RedisStore (mesmo Upstash) — ver
 * https://github.com/express-rate-limit/rate-limit-redis.
 */

const minutes = (n: number): number => n * 60_000;

const standardHeaders = true; /* RateLimit-* headers (RFC draft) */
const legacyHeaders = false; /* X-RateLimit-* (deprecated) */

/**
 * Login/Register: anti-brute-force.
 * 10 req / 15min por IP. Window deslizante; throttle progressivo o
 * suficiente pra inviabilizar password spraying sem perturbar UX legítima.
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: minutes(15),
  limit: 10,
  standardHeaders,
  legacyHeaders,
  message: { error: 'Muitas tentativas. Tente de novo em alguns minutos.' },
});

/**
 * Webhook: protege contra abuse de fila.
 * 60 req / minuto por IP (Meta enviaria menos que isso em pico real).
 * Tenants com webhook próprio podem ter limiter dedicado por tenantId
 * via custom keyGenerator no futuro.
 */
export const webhookLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: minutes(1),
  limit: 60,
  standardHeaders,
  legacyHeaders,
  message: { error: 'Webhook rate limit excedido.' },
});

/**
 * API geral autenticada: limite alto pra dashboards (polling de 4s
 * × múltiplos painéis = ~30 req/min por user em uso normal).
 * 300 req / minuto por IP.
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: minutes(1),
  limit: 300,
  standardHeaders,
  legacyHeaders,
  /* Chave por user logado se possível (mais justo que por IP); fallback IP. */
  keyGenerator: (req: Request) => {
    const claims = (req as { auth?: { sub?: string } }).auth;
    return claims?.sub ?? req.ip ?? 'unknown';
  },
  message: { error: 'Rate limit excedido.' },
});
