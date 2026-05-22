import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * CSRF protection via double-submit cookie pattern.
 *
 * Cookie de sessão `fury_session` é HttpOnly (XSS-proof), mas browsers
 * auto-enviam em qualquer cross-origin request — vulnerável a CSRF.
 *
 * Mitigação: cookie de CSRF `fury_csrf` (NÃO HttpOnly, legível por JS).
 * Em toda request mutante (POST/PATCH/DELETE/PUT), o frontend lê o cookie
 * + envia o valor no header `X-CSRF-Token`. Server compara cookie vs header
 * com timing-safe equality.
 *
 * Atacante numa origem diferente pode forçar o browser a enviar o cookie
 * (via form submit, fetch sem CORS preflight, etc.) mas NÃO consegue ler
 * o valor pra incluir no header — Same-Origin Policy bloqueia o read
 * cross-origin.
 *
 * Trade-off vs synchronizer token: server stateless aqui. Não precisa
 * gravar nada em sessão; cookie + header carregam toda a info.
 */

export const CSRF_COOKIE = 'fury_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function csrfCookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === 'production';
  return {
    /* Legível por JS — frontend precisa ler pra colocar no header. */
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: TWELVE_HOURS_MS,
  };
}

/** Gera token aleatório base64url (32 bytes = 256 bits entropia). */
export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
}

/* Métodos seguros (read-only) não precisam de CSRF check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Comparison timing-safe pra evitar timing attack na descoberta do token. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Middleware: rejeita requests mutantes sem cookie+header CSRF.
 *
 * Aplicar APÓS `cookieParser`. NÃO aplicar globalmente — usar em routers
 * autenticados (cookie-based). Webhook receiver, OAuth callback e endpoints
 * de auth pré-sessão (login, forgot-password) NÃO usam CSRF (não há cookie
 * ainda) — protegidos por outros mecanismos (HMAC, rate limit, etc.).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const cookies = (req as { cookies?: Record<string, unknown> }).cookies;
  const cookieRaw = cookies?.[CSRF_COOKIE];
  const cookieToken = typeof cookieRaw === 'string' ? cookieRaw : null;
  const headerTokenRaw = req.header(CSRF_HEADER);
  const headerToken = typeof headerTokenRaw === 'string' ? headerTokenRaw : null;

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    res.status(403).json({ error: 'CSRF token ausente ou inválido' });
    return;
  }
  next();
}
