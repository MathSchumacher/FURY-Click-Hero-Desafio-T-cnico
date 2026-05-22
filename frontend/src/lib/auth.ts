/* ── Client for /auth endpoints (sessão via cookie HttpOnly) ──
 *
 * Token PASETO vive APENAS em cookie HttpOnly setado pelo backend —
 * inacessível ao JS. XSS no frontend não consegue ler/exfiltrar token.
 *
 * USER_KEY em localStorage é cache visual não-sensível (nome, email,
 * createdAt) pra evitar piscar de "Olá, ..." enquanto /auth/me carrega.
 * Pode ser apagado sem prejuízo de segurança — não é credencial.
 */

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
  user: AuthUser;
};

/* Sempre `/api/*` — em dev o proxy do Vite redireciona pra localhost:3001;
   em prod o Netlify rewrite manda pro Render. Resultado: cookies HttpOnly
   sempre first-party de Netlify, sem third-party blocking de browsers. */
const API_BASE = '/api';

export function getGoogleSignInUrl(intent: 'login' | 'register'): string {
  return `${API_BASE}/auth/google?intent=${intent}`;
}

/** Guarda apenas o user em cache local. Token vai pro cookie HttpOnly via backend. */
export function setSession(user: AuthUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* noop */
  }
}

/** Busca o user atual via /auth/me. Browser envia cookie automaticamente. */
export async function fetchMe(): Promise<AuthUser> {
  const url = `${API_BASE}/auth/me`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar /auth/me`);
  }
  return (await res.json()) as AuthUser;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data['error'] === 'string' ? (data['error'] as string) : `HTTP ${res.status}`;
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
  setUser(out.user);
  return out;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const out = await postJson<AuthResponse>('/auth/register', { name, email, password });
  setUser(out.user);
  return out;
}

export async function logout(): Promise<void> {
  /* Revoga server-side (jti em Redis deny list) e backend limpa o cookie.
     Cookie auto-enviado pelo browser graças a credentials:'include'. */
  try {
    const path = `${API_BASE}/auth/logout`;
    await fetch(path, { method: 'POST', credentials: 'include' });
  } catch {
    /* swallow — limpa local mesmo se server falhou */
  }
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* noop */
  }
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function setUser(user: AuthUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* noop */
  }
}
