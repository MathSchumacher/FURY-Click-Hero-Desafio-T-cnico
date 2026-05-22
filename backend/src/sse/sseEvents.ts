/**
 * Camada SSE — funções puras + bridge entre BullMQ QueueEvents e
 * subscribers HTTP.
 *
 * Isolamos a lógica do route handler pra:
 *   1. Testar sem mockar Express/Response
 *   2. Reusar em /events/stream + futuras integrações (websocket, etc)
 */

import type { EventEmitter } from 'node:events';

/**
 * Mínima superfície que precisamos do response — qualquer coisa que escreva
 * chunks de string serve. Em prod é `express.Response`; em testes é um
 * objeto simples que coleta os chunks.
 */
export interface SseSink {
  write(chunk: string): boolean;
}

/**
 * Tipo do "event" do BullMQ QueueEvents — só os campos que usamos.
 * Ver: https://docs.bullmq.io/guide/queueevents
 */
type QueueEventPayload = {
  jobId?: string;
  returnvalue?: string;
  failedReason?: string;
  prev?: string;
};

/**
 * Formata frame SSE conforme RFC: "event: NAME\ndata: JSON\n\n".
 * Os dois \n no final terminam o frame; cliente dispatch sua handler.
 */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Comentário SSE (linha começando com ":") — válido pelo spec, ignorado
 * pelo cliente. Usado pra heartbeat: mantém connection viva através de
 * proxies que matam idle (~30s default no Render/Netlify).
 */
export function formatSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

/**
 * Extrai tenantId do jobId BullMQ. Formato: `${tenantId}__${adId}` (ver
 * queue/jobOptions.ts → buildJobId).
 */
export function parseTenantFromJobId(jobId: string): string | null {
  const idx = jobId.indexOf('__');
  return idx > 0 ? jobId.slice(0, idx) : null;
}

/**
 * Conecta o sink a eventos da fila, FILTRANDO pelo tenantId do user
 * autenticado. Multi-tenant isolation: jobs de outros tenants nunca
 * vazam pro stream.
 *
 * Retorna `unsubscribe()` que limpa TODOS os listeners — chamar em
 * `req.on('close')` pra evitar memory leak com muitos subscribers.
 */
export function attachSseSubscriber(opts: {
  sink: SseSink;
  tenantId: string;
  queueEvents: Pick<EventEmitter, 'on' | 'off'>;
}): () => void {
  const { sink, tenantId, queueEvents } = opts;

  function tryEmit(type: 'completed' | 'failed' | 'active', payload: QueueEventPayload): void {
    if (!payload.jobId) return;
    if (parseTenantFromJobId(payload.jobId) !== tenantId) return;
    sink.write(
      formatSseEvent('violation', {
        type,
        jobId: payload.jobId,
        error: payload.failedReason,
        ts: Date.now(),
      }),
    );
  }

  const onCompleted = (p: QueueEventPayload): void => { tryEmit('completed', p); };
  const onFailed    = (p: QueueEventPayload): void => { tryEmit('failed', p); };
  const onActive    = (p: QueueEventPayload): void => { tryEmit('active', p); };

  queueEvents.on('completed', onCompleted);
  queueEvents.on('failed', onFailed);
  queueEvents.on('active', onActive);

  return (): void => {
    queueEvents.off('completed', onCompleted);
    queueEvents.off('failed', onFailed);
    queueEvents.off('active', onActive);
  };
}
