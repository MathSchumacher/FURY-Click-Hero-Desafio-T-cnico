import { useEffect, useRef, useState } from 'react';

/**
 * Hook pra consumir SSE de /events/stream — push real-time de mudanças de
 * job/violation do backend.
 *
 * Status:
 *   - connecting: EventSource aberto, aguardando onopen
 *   - connected:  recebeu onopen, está escutando
 *   - error:      EventSource emitiu erro (browser tenta reconectar sozinho)
 *   - disabled:   hook foi montado com enabled=false, EventSource não foi criado
 *
 * URL hardcoded em /api/events/stream — mesmo padrão de lib/api.ts (proxy
 * Netlify → Render pra cookies first-party).
 *
 * EventSource já tem reconnect automático nativo (~3s default) — não
 * precisamos reimplementar exponential backoff. O `onerror` apenas reporta
 * status; o browser cuida do resto.
 */

export type StreamStatus = 'connecting' | 'connected' | 'error' | 'disabled';

export type ViolationEvent = {
  type: 'completed' | 'failed' | 'active';
  jobId: string;
  error?: string;
  ts: number;
};

type Options = {
  /** Default: true. Setar false desabilita o stream (útil pra rotas públicas). */
  enabled?: boolean;
  /** Callback executado pra cada frame `violation`. Payload já parseado. */
  onViolation?: (event: ViolationEvent) => void;
};

type LastEvent = { type: string; data: unknown } | null;

export function useEventStream(opts: Options = {}): {
  status: StreamStatus;
  lastEvent: LastEvent;
} {
  const { enabled = true, onViolation } = opts;
  const [status, setStatus] = useState<StreamStatus>(enabled ? 'connecting' : 'disabled');
  const [lastEvent, setLastEvent] = useState<LastEvent>(null);
  /* Ref pro callback pra não reconectar quando consumer passa inline fn */
  const onViolationRef = useRef(onViolation);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }
    if (typeof EventSource === 'undefined') {
      setStatus('error');
      return;
    }

    const es = new EventSource('/api/events/stream', { withCredentials: true });

    es.onopen = (): void => { setStatus('connected'); };
    es.onerror = (): void => { setStatus('error'); };

    const onConnected = (ev: MessageEvent): void => {
      setLastEvent({ type: 'connected', data: safeParse(ev.data) });
    };

    const onViolationFrame = (ev: MessageEvent): void => {
      const parsed = safeParse(ev.data);
      if (parsed === null) return;
      setLastEvent({ type: 'violation', data: parsed });
      onViolationRef.current?.(parsed as ViolationEvent);
    };

    es.addEventListener('connected', onConnected);
    es.addEventListener('violation', onViolationFrame);

    return (): void => {
      es.removeEventListener('connected', onConnected);
      es.removeEventListener('violation', onViolationFrame);
      es.close();
    };
  }, [enabled]);

  return { status, lastEvent };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
