import { describe, expect, it } from 'vitest';
import { csrfProtection } from './csrf.js';

type ReqMock = {
  method: string;
  cookies?: Record<string, unknown>;
  header: (k: string) => string | undefined;
};

type ResCapture = { statusCode?: number; jsonBody?: unknown };

function makeRes(): { res: ResCapture; api: { status: (n: number) => { json: (b: unknown) => void } } } {
  const res: ResCapture = {};
  const api = {
    status: (n: number) => ({
      json: (b: unknown) => {
        res.statusCode = n;
        res.jsonBody = b;
      },
    }),
  };
  return { res, api };
}

function runMiddleware(req: ReqMock): { res: ResCapture; nextCalled: boolean } {
  const { res, api } = makeRes();
  let nextCalled = false;
  csrfProtection(
    req as unknown as Parameters<typeof csrfProtection>[0],
    api as unknown as Parameters<typeof csrfProtection>[1],
    () => {
      nextCalled = true;
    },
  );
  return { res, nextCalled };
}

describe('csrfProtection middleware', () => {
  it('GET passa direto (método safe)', () => {
    const { nextCalled, res } = runMiddleware({
      method: 'GET',
      header: () => undefined,
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it('HEAD e OPTIONS também passam (preflight, etc)', () => {
    for (const method of ['HEAD', 'OPTIONS']) {
      const { nextCalled } = runMiddleware({ method, header: () => undefined });
      expect(nextCalled).toBe(true);
    }
  });

  it('POST sem cookie nem header → 403', () => {
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      header: () => undefined,
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toMatchObject({ error: expect.stringMatching(/csrf/i) });
  });

  it('POST com cookie mas SEM header → 403', () => {
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      cookies: { fury_csrf: 'abc123' },
      header: () => undefined,
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('POST com header mas SEM cookie → 403', () => {
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      header: (k) => (k === 'x-csrf-token' ? 'abc123' : undefined),
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('POST com cookie + header com VALORES DIFERENTES → 403', () => {
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      cookies: { fury_csrf: 'aaa' },
      header: (k) => (k === 'x-csrf-token' ? 'bbb' : undefined),
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('POST com cookie == header → next() (passa)', () => {
    const token = 'matching_token_value';
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      cookies: { fury_csrf: token },
      header: (k) => (k === 'x-csrf-token' ? token : undefined),
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it('PATCH / DELETE / PUT também são validados', () => {
    for (const method of ['PATCH', 'DELETE', 'PUT']) {
      const { res, nextCalled } = runMiddleware({
        method,
        header: () => undefined,
      });
      expect(nextCalled, `${method} sem CSRF deveria 403`).toBe(false);
      expect(res.statusCode).toBe(403);
    }
  });

  it('cookie como número (tipo errado) → tratado como ausente → 403', () => {
    const { res, nextCalled } = runMiddleware({
      method: 'POST',
      cookies: { fury_csrf: 12345 as unknown as string },
      header: (k) => (k === 'x-csrf-token' ? '12345' : undefined),
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
