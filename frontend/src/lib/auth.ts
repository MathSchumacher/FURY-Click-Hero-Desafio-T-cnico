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
  requestId?: string;
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
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (netErr) {
    console.error('[fury][network]', { url, error: netErr });
    throw new Error('Sem conexão ao validar sessão.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body: Record<string, unknown> | null = null;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      /* corpo não é JSON */
    }
    console.error('[fury][http]', {
      url,
      status: res.status,
      backendMessage: body?.['error'],
      requestId: body?.['requestId'],
      body,
    });
    throw new Error(`HTTP ${res.status} ao buscar /auth/me`);
  }
  return (await res.json()) as AuthUser;
}

/**
 * Mapeia status codes pra mensagens amigáveis quando o backend não
 * conseguiu enviar um corpo útil (ex: timeout no proxy do Netlify).
 */
function fallbackErrorMessage(status: number): string {
  switch (status) {
    case 504:
      return 'O servidor está aquecendo (Render free tier hiberna). Aguarde ~30s e tente novamente.';
    case 503:
      return 'Serviço indisponível no momento. Tente novamente em alguns segundos.';
    case 502:
      return 'O backend não respondeu. Verifique sua conexão e tente novamente.';
    case 0:
      return 'Sem conexão com o servidor. Verifique a internet ou tente em janela anônima.';
    default:
      return `Erro inesperado (HTTP ${status}).`;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    /* Falha de rede (CORS, DNS, offline). Log + mensagem clara. */
    console.error('[fury][network]', { url, error: netErr });
    const err = new Error(fallbackErrorMessage(0)) as Error & AuthError;
    err.field = '_';
    throw err;
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const backendMessage = typeof data['error'] === 'string' ? (data['error'] as string) : null;
    const message = backendMessage ?? fallbackErrorMessage(res.status);
    const field = typeof data['field'] === 'string' ? (data['field'] as AuthError['field']) : '_';
    const requestId =
      typeof data['requestId'] === 'string' ? (data['requestId'] as string) : null;
    const details =
      typeof data['details'] === 'string' ? (data['details'] as string) : null;
    /* console.error com contexto completo — fica visível em DevTools sem
       precisar do dashboard do Render. */
    console.error('[fury][http]', {
      url,
      status: res.status,
      backendMessage,
      requestId,
      details,
      body: data,
    });
    const err = new Error(message) as Error & AuthError & { requestId?: string };
    err.message = message;
    err.field = field;
    if (requestId) err.requestId = requestId;
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

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(document.cookie);
  return match?.[1] ?? null;
}

export async function logout(): Promise<void> {
  /* Revoga server-side (jti em Redis deny list) e backend limpa o cookie.
     Inclui CSRF token (double-submit) — sem ele o backend rejeita 403. */
  try {
    const csrf = readCookie('fury_csrf');
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
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
