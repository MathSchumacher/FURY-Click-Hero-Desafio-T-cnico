import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  attachSseSubscriber,
  formatSseEvent,
  formatSseComment,
  parseTenantFromJobId,
  type SseSink,
} from './sseEvents.js';

/**
 * Specs da camada SSE — funções puras + bridge BullMQ QueueEvents → sink.
 *
 * Decisões testadas:
 *   - Frames SSE seguem RFC: "event: X\ndata: {...}\n\n"
 *   - Eventos de OUTROS tenants são descartados (multi-tenant isolation)
 *   - Listeners removem-se no unsubscribe (evita memory leak)
 *   - Heartbeat usa comentário ":" — válido SSE, ignorado pelo cliente
 */

describe('formatSseEvent', () => {
  it('emite frame válido com event + data JSON + dois \\n', () => {
    const out = formatSseEvent('violation', { type: 'completed', jobId: 't__a' });
    expect(out).toBe('event: violation\ndata: {"type":"completed","jobId":"t__a"}\n\n');
  });

  it('serializa data como JSON mesmo pra valores primitivos', () => {
    expect(formatSseEvent('ping', 42)).toBe('event: ping\ndata: 42\n\n');
  });
});

describe('formatSseComment', () => {
  it('emite linha de comentário (heartbeat) que cliente ignora', () => {
    expect(formatSseComment('ping')).toBe(': ping\n\n');
  });
});

describe('parseTenantFromJobId', () => {
  it('extrai tenantId quando jobId segue padrão tenant__ad', () => {
    expect(parseTenantFromJobId('tenant_acme__ad_42')).toBe('tenant_acme');
    expect(parseTenantFromJobId('cuid_xyz_123__ad_99')).toBe('cuid_xyz_123');
  });

  it('retorna null pra jobId mal-formado', () => {
    expect(parseTenantFromJobId('no_separator_here')).toBeNull();
    expect(parseTenantFromJobId('')).toBeNull();
  });
});

describe('attachSseSubscriber', () => {
  function makeSink(): SseSink & { chunks: string[] } {
    const chunks: string[] = [];
    return {
      chunks,
      write: (chunk: string): boolean => {
        chunks.push(chunk);
        return true;
      },
    };
  }

  it('encaminha events.completed pro sink quando tenant bate', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();

    attachSseSubscriber({ sink, tenantId: 'tenant_acme', queueEvents: emitter });

    emitter.emit('completed', { jobId: 'tenant_acme__ad_42', returnvalue: '{}' });

    expect(sink.chunks).toHaveLength(1);
    expect(sink.chunks[0]).toContain('event: violation');
    expect(sink.chunks[0]).toContain('"type":"completed"');
    expect(sink.chunks[0]).toContain('"jobId":"tenant_acme__ad_42"');
  });

  it('FILTRA events de outros tenants (multi-tenant isolation)', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();

    attachSseSubscriber({ sink, tenantId: 'tenant_acme', queueEvents: emitter });

    emitter.emit('completed', { jobId: 'tenant_globex__ad_99', returnvalue: '{}' });
    emitter.emit('failed', { jobId: 'tenant_globex__ad_100', failedReason: 'boom' });

    expect(sink.chunks).toHaveLength(0);
  });

  it('emite event "failed" com mensagem de erro do worker', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();

    attachSseSubscriber({ sink, tenantId: 'tenant_acme', queueEvents: emitter });

    emitter.emit('failed', {
      jobId: 'tenant_acme__ad_42',
      failedReason: 'Upstream timeout',
    });

    expect(sink.chunks[0]).toContain('"type":"failed"');
    expect(sink.chunks[0]).toContain('"error":"Upstream timeout"');
  });

  it('emite event "active" quando worker começa o job', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();

    attachSseSubscriber({ sink, tenantId: 'tenant_acme', queueEvents: emitter });
    emitter.emit('active', { jobId: 'tenant_acme__ad_42', prev: 'waiting' });

    expect(sink.chunks[0]).toContain('"type":"active"');
  });

  it('unsubscribe remove TODOS os listeners (evita memory leak)', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();
    const offSpy = vi.spyOn(emitter, 'off');

    const unsubscribe = attachSseSubscriber({
      sink,
      tenantId: 'tenant_acme',
      queueEvents: emitter,
    });

    unsubscribe();

    /* 3 listeners adicionados (completed, failed, active) → 3 .off chamados */
    expect(offSpy).toHaveBeenCalledTimes(3);
    expect(emitter.listenerCount('completed')).toBe(0);
    expect(emitter.listenerCount('failed')).toBe(0);
    expect(emitter.listenerCount('active')).toBe(0);
  });

  it('ignora event payload sem jobId (defensive)', () => {
    const sink = makeSink();
    const emitter = new EventEmitter();

    attachSseSubscriber({ sink, tenantId: 'tenant_acme', queueEvents: emitter });
    emitter.emit('completed', { returnvalue: 'oops sem jobId' });

    expect(sink.chunks).toHaveLength(0);
  });
});
