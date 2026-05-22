import { describe, expect, it } from 'vitest';
import { UpstreamError, callUpstream } from './upstream.js';

/* ── Helpers ───────────────────────────────────────────── */

type FakeFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

const okResponse =
  (status = 200): FakeFetch =>
  async () =>
    new Response(JSON.stringify({ id: 1 }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

const errorResponse =
  (status: number): FakeFetch =>
  async () =>
    new Response('upstream error', { status });

const networkError: FakeFetch = async () => {
  throw new TypeError('network unreachable');
};

const hangs = (): FakeFetch => async (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });

/* ── Tests ─────────────────────────────────────────────── */

describe('callUpstream', () => {
  it('retorna { status } quando upstream responde 2xx', async () => {
    const result = await callUpstream('http://x', 1000, okResponse(200) as typeof fetch);
    expect(result).toEqual({ status: 200 });
  });

  it('lança UpstreamError com status quando upstream responde 404', async () => {
    await expect(
      callUpstream('http://x', 1000, errorResponse(404) as typeof fetch),
    ).rejects.toMatchObject({ name: 'UpstreamError', status: 404 });
  });

  it('lança UpstreamError com status quando upstream responde 500', async () => {
    await expect(
      callUpstream('http://x', 1000, errorResponse(500) as typeof fetch),
    ).rejects.toMatchObject({ name: 'UpstreamError', status: 500 });
  });

  it('lança UpstreamError com mensagem de timeout quando aborta', async () => {
    const error = await callUpstream('http://x', 10, hangs() as typeof fetch).catch((e) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.message).toMatch(/timeout/i);
    expect(error.status).toBeUndefined();
  });

  it('lança UpstreamError quando há erro de rede', async () => {
    const error = await callUpstream('http://x', 1000, networkError as typeof fetch).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.message).toMatch(/network/i);
    expect(error.status).toBeUndefined();
  });
});
