import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getWebhookSecret, rotateWebhookSecret } from './api';

/**
 * Tests pro client de webhook-secret. Mock o `fetch` global e valida:
 *   - URL correta (com prefix /api)
 *   - credentials: 'include'
 *   - Header X-CSRF-Token só nas rotas mutantes (POST)
 *   - Erro do backend é re-lançado como Error com a mensagem do payload
 */

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('webhook-secret API client', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    /* CSRF cookie precisa estar setado pro POST funcionar */
    document.cookie = 'fury_csrf=csrf-test-token; path=/';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'fury_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  describe('getWebhookSecret', () => {
    it('GET /api/tenants/me/webhook-secret com credentials, sem CSRF header', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ secret: 'whk_abc123', instructions: 'use HMAC...' }),
      );

      const result = await getWebhookSecret();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/tenants/me/webhook-secret');
      expect(init.credentials).toBe('include');
      expect(init.method ?? 'GET').toBe('GET');
      expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
      expect(result).toEqual({ secret: 'whk_abc123', instructions: 'use HMAC...' });
    });

    it('throws Error com mensagem do backend em 403', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: 'apenas OWNER pode visualizar' }, { status: 403 }),
      );

      await expect(getWebhookSecret()).rejects.toThrow('apenas OWNER pode visualizar');
    });

    it('throws Error com fallback amigável em 504', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 504 }));

      await expect(getWebhookSecret()).rejects.toThrow(/aquecendo/i);
    });
  });

  describe('rotateWebhookSecret', () => {
    it('POST /api/tenants/me/webhook-secret/rotate com X-CSRF-Token header', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ secret: 'whk_rotated_xyz' }));

      const result = await rotateWebhookSecret();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/tenants/me/webhook-secret/rotate');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-test-token');
      expect(result).toEqual({ secret: 'whk_rotated_xyz' });
    });

    it('throws Error com mensagem do backend em 403 CSRF', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: 'CSRF token ausente ou inválido' }, { status: 403 }),
      );

      await expect(rotateWebhookSecret()).rejects.toThrow(/CSRF/i);
    });

    it('throws "Sem conexão" em network failure', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(rotateWebhookSecret()).rejects.toThrow('Sem conexão com o servidor.');
    });
  });
});
