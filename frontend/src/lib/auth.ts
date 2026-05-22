/* ── Client for /auth endpoints (PASETO V4 tokens) ── */

const TOKEN_KEY = 'fury_token';
const USER_KEY = 'fury_user';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type AuthError = {
  field?: 'name' | 'email' | 'password' | '_';
  message: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data['error'] === 'string' ? (data['error'] as string) : `HTTP ${res.status}`;
    const field = typeof data['field'] === 'string' ? (data['field'] as AuthError['field']) : '_';
    const err = new Error(message) as Error & AuthError;
    err.message = message;
    err.field = field;
    throw err;
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const out = await postJson<AuthResponse>('/auth/login', { email, password });
  setToken(out.token);
  setUser(out.user);
  return out;
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const out = await postJson<AuthResponse>('/auth/register', { name, email, password });
  setToken(out.token);
  setUser(out.user);
  return out;
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* noop */ }
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* noop */ }
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}
function setUser(user: AuthUser): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* noop */ }
}
