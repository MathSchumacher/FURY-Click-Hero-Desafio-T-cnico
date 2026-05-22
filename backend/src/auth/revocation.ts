import { redisConnection } from '../config/redis.js';

/**
 * Token revocation via lista deny em Redis.
 *
 * Cada token PASETO carrega um `jti` (UUID). No logout, gravamos esse
 * jti em Redis com TTL == tempo restante até expirar — após o TTL, o
 * token já não vale mais por conta própria, então a entrada some.
 *
 * O middleware requireAuth verifica isRevoked(jti) antes de aceitar.
 *
 * Por que Redis (e não DB): performance hot-path. Cada request autenticado
 * passa por aqui. Redis SET/GET é sub-ms; DB seria 5-10x mais lento e
 * adicionaria carga ao Postgres.
 */

const REDIS_PREFIX = 'auth:revoked:';

function secondsUntilExp(exp: string | undefined): number {
  if (!exp) return 3600 * 24; /* fallback 24h se sem exp */
  const expMs = Date.parse(exp);
  if (Number.isNaN(expMs)) return 3600 * 24;
  return Math.max(60, Math.ceil((expMs - Date.now()) / 1000));
}

/** Marca um jti como revogado por T segundos (até o exp natural do token). */
export async function revokeToken(jti: string, exp: string | undefined): Promise<void> {
  if (!jti) return;
  const ttl = secondsUntilExp(exp);
  await redisConnection.set(`${REDIS_PREFIX}${jti}`, '1', 'EX', ttl);
}

/** Retorna true se o token foi revogado. */
export async function isRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false; /* token velho sem jti — não tem como revogar (será aceito até expirar naturalmente) */
  const v = await redisConnection.get(`${REDIS_PREFIX}${jti}`);
  return v !== null;
}
