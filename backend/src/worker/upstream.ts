import { env } from '../config/env.js';

/**
 * Upstream client for the simulated Meta Ads takedown call.
 *
 * URL + timeout default come from env (UPSTREAM_URL, UPSTREAM_TIMEOUT_MS) but
 * both can be overridden per call — useful for tests.
 *
 * Maps every failure mode (HTTP, abort/timeout, network, parse) to a single
 * UpstreamError type so the worker has one place to catch and let BullMQ retry.
 */

export const UPSTREAM_URL = env.UPSTREAM_URL;
export const UPSTREAM_TIMEOUT_MS = env.UPSTREAM_TIMEOUT_MS;

export class UpstreamError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'UpstreamError';
    if (status !== undefined) this.status = status;
  }
}

export type UpstreamSuccess = {
  status: number;
};

/** Node 18+ fetch (undici) throws an `Error` with `name === 'AbortError'`
 *  when AbortController fires. Older runtimes may throw `DOMException`.
 *  Detect both. */
function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && err instanceof DOMException))
  );
}

export type FetchLike = typeof fetch;

/**
 * Calls the upstream Meta Ads stub. Returns the HTTP status on success;
 * throws UpstreamError on any failure (HTTP >= 400, abort/timeout, network).
 *
 * `fetchImpl` is injectable so the worker can be tested without real network.
 */
export async function callUpstream(
  url: string = UPSTREAM_URL,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch,
): Promise<UpstreamSuccess> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new UpstreamError(`upstream HTTP ${res.status}`, res.status);
    }
    return { status: res.status };
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (isAbortError(err)) {
      throw new UpstreamError(`upstream timeout after ${timeoutMs}ms`);
    }
    if (err instanceof Error) throw new UpstreamError(`upstream network error: ${err.message}`);
    throw new UpstreamError('upstream unknown error');
  } finally {
    clearTimeout(timer);
  }
}
