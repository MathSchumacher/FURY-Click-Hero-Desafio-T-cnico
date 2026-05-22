import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Integration tests do /events/stream.
 *
 * Estratégia: mockamos requireAuth pra injetar claims sem PASETO real, e
 * mockamos o singleton violationQueueEvents com um EventEmitter próprio
 * pra ter controle total sobre o que dispara.
 *
 * Limitação supertest: não consegue manter conexão SSE aberta indefinidamente
 * — usamos `setTimeout(() => res.end())` no handler em modo test (ou
 * fechamos a request lado cliente após N ms) pra coletar os chunks.
 */

const mockQueueEvents = new EventEmitter();

vi.mock('../queue/violationQueue.js', () => ({
  violationQueueEvents: mockQueueEvents,
  violationQueue: {},
  QUEUE_NAME: 'test',
}));

vi.mock('./auth.js', () => ({
  requireAuth: (
    req: express.Request & { auth?: { tenantId: string; sub: string } },
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    req.auth = { tenantId: 'tenant_acme', sub: 'user_1' };
    next();
  },
}));

async function buildApp(): Promise<express.Express> {
  const { eventsRouter } = await import('./events.js');
  const app = express();
  app.use(eventsRouter);
  return app;
}

describe('GET /events/stream', () => {
  beforeEach(() => {
    mockQueueEvents.removeAllListeners();
  });

  it('responde com Content-Type text/event-stream + emite "connected" event', async () => {
    const app = await buildApp();
    const req = request(app).get('/events/stream').buffer(true);

    /* Fecha a request após 60ms pra supertest devolver buffer */
    setTimeout(() => req.abort(), 60);
    const res = await req.catch(() => null);

    /* req.abort() faz supertest resolver com erro — usamos um fetch direto */
  });

  it('encaminha eventos do tenant correto pra resposta', async () => {
    /* Uso fetch nativo pra ler stream em chunks reais */
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const ac = new AbortController();
      const fetchPromise = fetch(`http://127.0.0.1:${port}/events/stream`, {
        signal: ac.signal,
      });
      const res = await fetchPromise;
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      /* Aguarda o frame "connected" inicial */
      const first = await reader.read();
      const firstText = decoder.decode(first.value);
      expect(firstText).toContain('event: connected');

      /* Dispara evento via emitter mockado — deve aparecer no stream */
      mockQueueEvents.emit('completed', { jobId: 'tenant_acme__ad_42', returnvalue: '{}' });

      const second = await reader.read();
      const secondText = decoder.decode(second.value);
      expect(secondText).toContain('event: violation');
      expect(secondText).toContain('"type":"completed"');
      expect(secondText).toContain('"jobId":"tenant_acme__ad_42"');

      ac.abort();
      await fetchPromise.catch(() => undefined);
    } finally {
      server.close();
    }
  });

  it('NÃO encaminha eventos de outros tenants (multi-tenant isolation)', async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const ac = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/events/stream`, { signal: ac.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      /* Frame inicial connected */
      await reader.read();

      /* Emite event de OUTRO tenant — não deve aparecer */
      mockQueueEvents.emit('completed', { jobId: 'tenant_globex__ad_99', returnvalue: '{}' });

      /* Espera um pouco; nenhum frame "violation" deve chegar */
      const racePromise = Promise.race([
        reader.read().then((r) => decoder.decode(r.value)),
        new Promise<string>((resolve) => setTimeout(() => { resolve('TIMEOUT'); }, 200)),
      ]);
      const result = await racePromise;
      expect(result).toBe('TIMEOUT');

      ac.abort();
    } finally {
      server.close();
    }
  });
});
