import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { changePassword } from './api';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('changePassword', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'fury_csrf=csrf-test; path=/';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'fury_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('POST /api/auth/change-password com CSRF header + body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await changePassword({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-strong',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/change-password');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-test');
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-strong',
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws com mensagem do backend em 401', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'senha atual incorreta', field: 'currentPassword' }, { status: 401 }),
    );

    await expect(
      changePassword({ currentPassword: 'wrong', newPassword: 'newpass1234' }),
    ).rejects.toThrow(/senha atual incorreta/i);
  });

  it('throws em 400 quando newPassword é curta', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'a nova senha deve ter ao menos 8 caracteres', field: 'newPassword' },
        { status: 400 },
      ),
    );

    await expect(
      changePassword({ currentPassword: 'oldpass1', newPassword: 'x' }),
    ).rejects.toThrow(/8 caracteres/i);
  });
});
