import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getHealth,
  getStats,
  getTenantMe,
  getViolations,
  type HealthSnapshot,
  type TenantInfo,
  type TenantStats,
  type ViolationsPage,
  type ViolationSeverity,
  type ViolationStatus,
} from '../lib/api';

/**
 * Hooks de polling pro dashboard "vivo".
 *
 * Cada hook usa setInterval pra refetch automático. Polling pausa quando
 * o tab perde foco (Page Visibility API) — economiza requisições à Render
 * free tier e evita burnar o orçamento de commands do Upstash.
 *
 * Pode-se trocar por SSE/WebSocket no futuro. Por ora polling = simplicidade.
 */

const DEFAULT_INTERVAL_MS = 4000;

function usePolling<T>(
  fetcher: () => Promise<T>,
  options: { intervalMs?: number; deps?: unknown[] } = {},
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async (): Promise<void> => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = (): void => {
      if (timer) return;
      void tick();
      timer = setInterval(() => {
        if (!document.hidden) void tick();
      }, intervalMs);
    };
    const stop = (): void => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = (): void => {
      if (document.hidden) stop();
      else if (!stopped) start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...(options.deps ?? [])]);

  return { data, loading, error, refetch: () => void tick() };
}

export function useTenantInfo(): {
  data: TenantInfo | null;
  loading: boolean;
  error: Error | null;
} {
  /* tenant info não muda, não precisa polling */
  const [data, setData] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    getTenantMe()
      .then((t) => alive && setData(t))
      .catch((e) => alive && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, error };
}

export function useStats(intervalMs = DEFAULT_INTERVAL_MS): {
  data: TenantStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  return usePolling<TenantStats>(getStats, { intervalMs });
}

export function useHealth(intervalMs = 5000): {
  data: HealthSnapshot | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  return usePolling<HealthSnapshot>(getHealth, { intervalMs });
}

export function useViolations(params: {
  page?: number;
  limit?: number;
  status?: ViolationStatus;
  severity?: ViolationSeverity;
  intervalMs?: number;
} = {}): {
  data: ViolationsPage | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { page, limit, status, severity, intervalMs } = params;
  return usePolling<ViolationsPage>(() => getViolations({ page, limit, status, severity }), {
    intervalMs: intervalMs ?? DEFAULT_INTERVAL_MS,
    deps: [page, limit, status, severity],
  });
}
