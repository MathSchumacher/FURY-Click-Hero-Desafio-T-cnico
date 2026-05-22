import { randomBytes } from 'node:crypto';
import { redisConnection } from '../config/redis.js';

/**
 * OAuth state com nonce CSRF.
 *
 * O Google espera receber + devolver o param `state` intacto no callback.
 * Encodamos { nonce, intent } como JSON base64url, e gravamos o nonce no
 * Redis com TTL de 10min. No callback verificamos:
 *   1. State decoda pra { nonce, intent } válidos
 *   2. Nonce existe no Redis (=> request veio do nosso fluxo)
 *   3. Nonce não foi usado ainda (consumimos atomically via DEL)
 *
 * Sem isso, atacante constrói um link `/auth/google?intent=register`
 * que força a victim vincular o googleId DELE à conta dela.
 */

const NONCE_TTL_SECONDS = 600; /* 10 minutos */
const REDIS_PREFIX = 'oauth:nonce:';

export type OAuthIntent = 'login' | 'register';
export type OAuthState = { nonce: string; intent: OAuthIntent };

/** Encoda state pra base64url (URL-safe, sem padding). */
function encodeState(s: OAuthState): string {
  return Buffer.from(JSON.stringify(s), 'utf-8').toString('base64url');
}

function decodeState(raw: string): OAuthState | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'nonce' in parsed &&
      'intent' in parsed &&
      typeof (parsed as { nonce: unknown }).nonce === 'string' &&
      ((parsed as { intent: unknown }).intent === 'login' ||
        (parsed as { intent: unknown }).intent === 'register')
    ) {
      return parsed as OAuthState;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cria nonce + grava em Redis + devolve state encoded pra passar no
 * generateAuthUrl({ state }).
 */
export async function issueOAuthState(intent: OAuthIntent): Promise<string> {
  const nonce = randomBytes(24).toString('base64url'); /* 32 chars URL-safe */
  await redisConnection.set(`${REDIS_PREFIX}${nonce}`, intent, 'EX', NONCE_TTL_SECONDS);
  return encodeState({ nonce, intent });
}

/**
 * Valida + consome nonce. Retorna intent se válido, null caso contrário.
 * Uso single-shot: o nonce é deletado atomically com GETDEL pra evitar
 * race conditions / replay attacks.
 */
export async function consumeOAuthState(raw: string): Promise<OAuthIntent | null> {
  const state = decodeState(raw);
  if (!state) return null;
  /* GETDEL é atomic — só um caller consegue resgatar o intent. */
  const stored = await redisConnection.getdel(`${REDIS_PREFIX}${state.nonce}`);
  if (stored === null) return null; /* nonce inexistente, expirado ou já usado */
  if (stored !== state.intent) return null; /* tampered: state diz X, Redis diz Y */
  return state.intent;
}
