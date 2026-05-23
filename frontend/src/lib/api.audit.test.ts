import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAuditLog } from './api';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getAuditLog', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/audit/me sem query quando params vazios', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ total: 0, page: 1, limit: 20, items: [] }),
    );

    await getAuditLog();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/audit/me');
    expect(init.credentials).toBe('include');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('serializa params como query string', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ total: 5, page: 2, limit: 10, items: [] }),
    );

    await getAuditLog({ page: 2, limit: 10, action: 'USER_LOGIN_SUCCESS' });

    const [url] = fetchMock.mock.calls[0] as [string];
    /* Aceita qualquer ordem dos params */
    expect(url).toMatch(/^\/api\/audit\/me\?/);
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('action=USER_LOGIN_SUCCESS');
  });

  it('retorna body parseado tipado', async () => {
    const body = {
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'ae_1',
          action: 'USER_LOGIN_SUCCESS',
          userId: 'u_1',
          tenantId: 't_1',
          metadata: { foo: 'bar' },
          ipAddress: '1.2.3.4',
          userAgent: 'curl/8',
          createdAt: '2026-05-22T20:00:00.000Z',
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(body));

    const result = await getAuditLog();
    expect(result).toEqual(body);
  });

  it('throws com mensagem do backend em 403', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'apenas OWNER pode visualizar audit log' }, { status: 403 }),
    );

    await expect(getAuditLog()).rejects.toThrow(/apenas OWNER/i);
  });
});
