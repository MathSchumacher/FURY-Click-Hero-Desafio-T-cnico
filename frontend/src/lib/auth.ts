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

/* Em prod (Netlify), VITE_API_URL aponta pra https://...onrender.com.
   Em dev, fica vazio e o proxy do Vite cuida do /api → localhost:3001. */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/* URL pra iniciar o fluxo Google OAuth. Usa full URL em prod (browser
   navega pro backend), e /api em dev pro Vite proxy cuidar.
   `intent` distingue login (só user existente) de register (cria/vincula). */
export function getGoogleSignInUrl(intent: 'login' | 'register'): string {
  const base = API_BASE ? `${API_BASE}/auth/google` : '/api/auth/google';
  return `${base}?intent=${intent}`;
}

/** Salva token + user vindos do callback OAuth (sem fazer login com senha). */
export function setSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* noop */
  }
}

/** Busca o user atual via /auth/me usando o token do localStorage. */
export async function fetchMe(): Promise<AuthUser> {
  const token = getToken();
  if (!token) throw new Error('Sem token de sessão.');
  const url = API_BASE ? `${API_BASE}/auth/me` : '/api/auth/me';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar /auth/me`);
  }
  return (await res.json()) as AuthUser;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : `/api${path}`;
  const res = await fetch(url, {
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

export async function logout(): Promise<void> {
  /* Revoga server-side primeiro pra invalidar o token em todos os
     dispositivos (já que jti vai pro Redis deny list). Se falhar
     (offline, server down), ainda limpa local — UX prioriza logout
     visível pro user mesmo se a chamada não foi confirmada. */
  const token = getToken();
  if (token) {
    try {
      const path = API_BASE ? `${API_BASE}/auth/logout` : '/api/auth/logout';
      await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* swallow — limpa local mesmo se server falhou */
    }
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* noop */
  }
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
