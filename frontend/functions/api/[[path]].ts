/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Pages Function — proxy `/api/*` pro backend no Render.
 *
 * Substitui o rewrite do Netlify (que estourou 100GB/mês) + o
 * `_redirects 200!` do CF Pages (que não aceita destino externo).
 * Functions rodam em Workers infra — bandwidth ilimitado no free tier
 * e streaming nativo (SSE funciona de verdade).
 *
 * Mantém cookies first-party: o browser vê backend como mesmo origin que
 * o frontend, então `fury_session` (HttpOnly) cruza sem problema com
 * SameSite=Lax.
 *
 * O catch-all `[[path]]` matcha QUALQUER profundidade depois de /api/.
 */

const BACKEND_ORIGIN = 'https://fury-click-hero-desafio-t-cnico.onrender.com';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  /* Tira o prefixo /api do path antes de mandar pro backend.
     Ex: /api/auth/me → /auth/me */
  const backendPath = url.pathname.replace(/^\/api/, '') || '/';
  const target = `${BACKEND_ORIGIN}${backendPath}${url.search}`;

  /* Preserva method, headers, body, e cookies (Workers fetch propaga tudo). */
  const proxied = new Request(target, context.request);

  /* `redirect: 'manual'` — não seguimos redirects automaticamente; deixamos
     o cliente decidir. Importante pro flow OAuth do Google. */
  return fetch(proxied, { redirect: 'manual' });
};
