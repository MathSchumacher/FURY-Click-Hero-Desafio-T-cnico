/* ── Client typado pros endpoints autenticados do backend ──
 *
 * Sessão vive em cookie HttpOnly setado pelo backend. Toda chamada usa
 * `credentials: 'include'` pra o browser anexar o cookie automaticamente
 * em requests cross-origin (Netlify → Render). CORS allowlist no backend
 * já tem `credentials: true`.
 */

/* Mesma estratégia do lib/auth.ts: sempre `/api/*`. Em dev = Vite proxy.
   Em prod = Netlify rewrite pro Render. Cookies HttpOnly first-party. */
const API_BASE = '/api';

function url(path: string): string {
  return `${API_BASE}${path}`;
}

/** Lê valor do cookie `fury_csrf` (NÃO HttpOnly por design — JS precisa ler). */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)fury_csrf=([^;]+)/.exec(document.cookie);
  return match?.[1] ?? null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  /* Para métodos mutantes (POST/PATCH/DELETE/PUT) adicionamos o header
     CSRF lido do cookie — o backend valida cookie == header (double-submit). */
  const method = (init.method ?? 'GET').toUpperCase();
  const needsCsrf = !SAFE_METHODS.has(method);
  const csrfToken = needsCsrf ? readCsrfCookie() : null;

  const res = await fetch(url(path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const errBody = body as { error?: string } | null;
    throw new Error(errBody?.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

/* ── Tipos das respostas do backend ──────────────────────────── */

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
};

export type TenantStats = {
  total: number;
  byStatus: { queued: number; active: number; completed: number; failed: number };
  bySeverity: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
};

export type ViolationStatus = 'queued' | 'active' | 'completed' | 'failed';
export type ViolationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ViolationType = 'PROHIBITED_TERM' | 'BRAND_VIOLATION' | 'COMPLIANCE_FAIL';

export type ViolationListItem = {
  id: string;
  adId: string;
  severity: ViolationSeverity;
  violationType: ViolationType;
  status: ViolationStatus;
  attempts: number;
  detectedAt: string;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  upstreamStatus: number | null;
  upstreamLatencyMs: number | null;
};

export type ViolationsPage = {
  total: number;
  page: number;
  limit: number;
  items: ViolationListItem[];
};

/* ── Endpoints ───────────────────────────────────────────────── */

export function getTenantMe(): Promise<TenantInfo> {
  return authed<TenantInfo>('/tenants/me');
}

export function getStats(): Promise<TenantStats> {
  return authed<TenantStats>('/tenants/me/stats');
}

export function getViolations(params: {
  page?: number;
  limit?: number;
  status?: ViolationStatus;
  severity?: ViolationSeverity;
} = {}): Promise<ViolationsPage> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  if (params.severity) qs.set('severity', params.severity);
  const suffix = qs.toString();
  return authed<ViolationsPage>(`/tenants/me/violations${suffix ? `?${suffix}` : ''}`);
}

/* ── Job lookup (pra polling do Simulate Violation) ──────────── */

export type JobStatus = {
  jobId: string;
  status: ViolationStatus;
  attempts: number;
  result: {
    upstreamStatus: number | null;
    upstreamLatencyMs: number | null;
    adId: string;
    tenantId: string;
    finishedAt: string | null;
  } | null;
  error: string | null;
};

export function getJob(jobId: string): Promise<JobStatus> {
  /* /jobs/:id agora exige auth + tenant scope — usa o helper authed() */
  return authed<JobStatus>(`/jobs/${jobId}`);
}

/* ── Health (público, sem token) ─────────────────────────────── */

export type HealthSnapshot = {
  ok: boolean;
  redis: 'up' | 'down';
  queue: {
    name: string;
    counts: {
      active: number;
      completed: number;
      delayed: number;
      failed: number;
      paused: number;
      prioritized: number;
      waiting: number;
      'waiting-children': number;
    };
  };
  uptimeSeconds: number;
  checkDurationMs: number;
  timestamp: string;
};

export async function getHealth(): Promise<HealthSnapshot> {
  const res = await fetch(url('/health'));
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 503) {
    const errBody = body as { error?: string } | null;
    throw new Error(errBody?.error ?? `HTTP ${res.status}`);
  }
  return body as HealthSnapshot;
}

/* ── Webhook (Simulate Violation form do dashboard) ──────────── */

export type SimulateViolationPayload = {
  adId: string;
  tenantId: string;
  violationType: ViolationType;
  severity: ViolationSeverity;
  detectedAt: string;
};

export type SimulateViolationResult = {
  jobId: string;
  status: string;
  severity?: string;
  deduplicated?: boolean;
};

export async function simulateViolation(
  payload: SimulateViolationPayload,
): Promise<SimulateViolationResult> {
  const res = await fetch(url('/webhook/violation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const errBody = body as { error?: string } | null;
    throw new Error(errBody?.error ?? `HTTP ${res.status}`);
  }
  return body as SimulateViolationResult;
}
