import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from './auth.js';
import { violationQueueEvents } from '../queue/violationQueue.js';
import {
  attachSseSubscriber,
  formatSseComment,
  formatSseEvent,
} from '../sse/sseEvents.js';
import { logger } from '../lib/logger.js';

export const eventsRouter: Router = Router();

/**
 * GET /events/stream
 *
 * Server-Sent Events — long-lived HTTP response que emite frames toda vez
 * que o worker BullMQ muda o estado de um job pertencente ao tenant do
 * usuário autenticado.
 *
 * Eventos emitidos:
 *   - `connected`  — frame inicial, confirma sessão válida + envia ts
 *   - `violation`  — completed / failed / active de job do tenant
 *   - ":heartbeat" (comentário, cliente ignora) — a cada 25s pra manter
 *      conexão aberta através de proxies (Render/Netlify mata idle ~30s)
 *
 * Proxy buffering OFF (X-Accel-Buffering: no) — caso o backend esteja
 * atrás de nginx, garante que frames sejam flushados imediatamente.
 *
 * Cleanup: req.on('close') chama unsubscribe (remove listeners) +
 * clearInterval (heartbeat). Sem isso, conexões fechadas vazam handlers.
 */
eventsRouter.get('/events/stream', requireAuth, (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    res.status(401).json({ error: 'não autenticado' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  /* Frame inicial — confirma pro cliente que a sessão e o stream estão OK */
  res.write(formatSseEvent('connected', { tenantId: claims.tenantId, ts: Date.now() }));

  const HEARTBEAT_MS = 25_000;
  const heartbeat = setInterval(() => {
    res.write(formatSseComment(`ping ${Date.now()}`));
  }, HEARTBEAT_MS);

  const unsubscribe = attachSseSubscriber({
    sink: res,
    tenantId: claims.tenantId,
    queueEvents: violationQueueEvents,
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.debug({ tenantId: claims.tenantId, userId: claims.sub }, 'sse:disconnected');
  });

  logger.debug({ tenantId: claims.tenantId, userId: claims.sub }, 'sse:connected');
});
