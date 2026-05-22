import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Cookies de sessão HttpOnly.
 *
 * Token PASETO vai em cookie `fury_session` (HttpOnly + Secure + SameSite),
 * inacessível ao JS — XSS não consegue ler. Em prod, frontend (Netlify) e
 * backend (Render) estão em domínios diferentes → SameSite=None + Secure
 * obrigatórios. Em dev, SameSite=Lax (mais simples).
 *
 * Bearer header continua aceito durante a transição pra não quebrar
 * clientes (curl/API). Quando frontend migrar 100%, remover Bearer.
 */

export const SESSION_COOKIE = 'fury_session';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function sessionCookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, /* HTTPS-only em prod; em dev/localhost aceita HTTP */
    sameSite: isProd ? 'none' : 'lax', /* cross-domain em prod (Netlify ↔ Render) */
    path: '/',
    maxAge: TWELVE_HOURS_MS,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  /* Mesmas options sem maxAge — força expiração imediata */
  res.clearCookie(SESSION_COOKIE, {
    ...sessionCookieOptions(),
    maxAge: undefined,
  });
}
