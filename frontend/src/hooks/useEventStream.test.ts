/**
 * Specs do hook useEventStream.
 *
 * Cobre:
 *   - EventSource aberto com URL correta (/api/events/stream)
 *   - `withCredentials: true` (cookie HttpOnly precisa cruzar)
 *   - status reflete: connecting → connected → disconnected ao close
 *   - lastEvent é atualizado quando "violation" chega
 *   - onViolation callback é chamado com payload parseado
 *   - cleanup fecha o EventSource (sem vazamento)
 *
 * jsdom não tem EventSource — mocka com classe controlável.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEventStream } from './useEventStream';

type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  static OPEN = 1;
  url: string;
  withCredentials: boolean;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  private listeners: Record<string, Listener[]> = {};
  closed = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, fn: Listener): void {
    (this.listeners[event] ??= []).push(fn);
  }

  removeEventListener(event: string, fn: Listener): void {
    this.listeners[event] = (this.listeners[event] ?? []).filter((f) => f !== fn);
  }

  dispatch(event: string, data: string): void {
    const ev = new MessageEvent(event, { data });
    this.listeners[event]?.forEach((fn) => { fn(ev); });
    if (event === 'message') this.onmessage?.(ev);
  }

  open(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.();
  }

  error(): void {
    this.onerror?.();
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

describe('useEventStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('abre EventSource em /api/events/stream com withCredentials=true', () => {
    renderHook(() => useEventStream());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]!.url).toBe('/api/events/stream');
    expect(MockEventSource.instances[0]!.withCredentials).toBe(true);
  });

  it('status: connecting → connected ao receber onopen', async () => {
    const { result } = renderHook(() => useEventStream());
    expect(result.current.status).toBe('connecting');

    act(() => { MockEventSource.instances[0]!.open(); });
    await waitFor(() => { expect(result.current.status).toBe('connected'); });
  });

  it('atualiza lastEvent quando frame "violation" chega', async () => {
    const { result } = renderHook(() => useEventStream());
    act(() => { MockEventSource.instances[0]!.open(); });

    const payload = { type: 'completed', jobId: 'tenant_acme__ad_42', ts: 12345 };
    act(() => {
      MockEventSource.instances[0]!.dispatch('violation', JSON.stringify(payload));
    });

    await waitFor(() => {
      expect(result.current.lastEvent).toEqual({ type: 'violation', data: payload });
    });
  });

  it('chama onViolation callback com o payload parseado', async () => {
    const onViolation = vi.fn();
    renderHook(() => useEventStream({ onViolation }));
    act(() => { MockEventSource.instances[0]!.open(); });

    const payload = { type: 'failed', jobId: 'tenant_acme__ad_99', error: 'timeout', ts: 1 };
    act(() => {
      MockEventSource.instances[0]!.dispatch('violation', JSON.stringify(payload));
    });

    await waitFor(() => { expect(onViolation).toHaveBeenCalledWith(payload); });
  });

  it('status vai pra "error" quando EventSource emite erro', async () => {
    const { result } = renderHook(() => useEventStream());
    act(() => { MockEventSource.instances[0]!.error(); });
    await waitFor(() => { expect(result.current.status).toBe('error'); });
  });

  it('NÃO abre EventSource quando enabled=false', () => {
    renderHook(() => useEventStream({ enabled: false }));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('fecha EventSource no unmount (cleanup)', () => {
    const { unmount } = renderHook(() => useEventStream());
    const es = MockEventSource.instances[0]!;
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('ignora payload mal-formado (JSON inválido) sem crashar', async () => {
    const onViolation = vi.fn();
    const { result } = renderHook(() => useEventStream({ onViolation }));
    act(() => { MockEventSource.instances[0]!.open(); });
    act(() => {
      MockEventSource.instances[0]!.dispatch('violation', '{this is not json');
    });
    expect(onViolation).not.toHaveBeenCalled();
    expect(result.current.status).toBe('connected');
  });
});
