import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { csrfProtection } from '../auth/csrf.js';
import { recordAudit } from '../lib/audit.js';
import { generateWebhookSecret } from '../auth/webhookSignature.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const tenantsRouter: Router = Router();

/**
 * Rotas que alimentam o dashboard do tenant atual do user logado.
 * Todas exigem PASETO V4 válido. O tenantId vem das claims do token —
 * pra trocar de tenant, frontend chama re-login (futura feature: switcher).
 */

tenantsRouter.use(requireAuth);

/** Garante que o user logado é membro do tenant das claims. Lança status code. */
async function requireMembership(userId: string, tenantId: string): Promise<void> {
  const m = await prisma.membership.findFirst({ where: { userId, tenantId } });
  if (!m) {
    throw Object.assign(new Error('sem acesso a esse workspace'), { status: 403 });
  }
}

/**
 * GET /tenants/me
 *   404 → tenantId do token não existe mais (banco limpo, conta legada)
 *   403 → user não é mais membership do tenant
 *   200 → { id, name, slug, createdAt, role }
 */
tenantsRouter.get('/tenants/me', async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: claims.tenantId } });
  if (!tenant) {
    return res.status(404).json({ error: 'workspace não encontrado' });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: claims.sub, tenantId: claims.tenantId },
  });
  if (!membership) {
    return res.status(403).json({ error: 'sem acesso a esse workspace' });
  }

  return res.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    createdAt: tenant.createdAt.toISOString(),
    role: membership.role,
  });
});

/**
 * GET /tenants/me/stats
 *
 * Agrega violations do tenant atual em counts por status e severity.
 * Usado pelos quick stats + severity donut do dashboard.
 *
 *   { total, byStatus: {queued, active, completed, failed},
 *     bySeverity: {LOW, MEDIUM, HIGH, CRITICAL} }
 */
const STATUS_LOWERCASE = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
type RawStatus = keyof typeof STATUS_LOWERCASE;
type RawSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

tenantsRouter.get('/tenants/me/stats', async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }

  try {
    await requireMembership(claims.sub, claims.tenantId);
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 500).json({ error: e.message });
  }

  const [total, byStatusGroups, bySeverityGroups] = await Promise.all([
    prisma.violation.count({ where: { tenantId: claims.tenantId } }),
    prisma.violation.groupBy({
      by: ['status'],
      where: { tenantId: claims.tenantId },
      _count: { _all: true },
    }),
    prisma.violation.groupBy({
      by: ['severity'],
      where: { tenantId: claims.tenantId },
      _count: { _all: true },
    }),
  ]);

  const byStatus = { queued: 0, active: 0, completed: 0, failed: 0 };
  for (const g of byStatusGroups as { status: RawStatus; _count: { _all: number } }[]) {
    byStatus[STATUS_LOWERCASE[g.status]] = g._count._all;
  }

  const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const g of bySeverityGroups as { severity: RawSeverity; _count: { _all: number } }[]) {
    bySeverity[g.severity] = g._count._all;
  }

  return res.json({ total, byStatus, bySeverity });
});

/**
 * GET /tenants/me/violations?page=1&limit=20&status=completed&severity=HIGH
 *
 * Lista paginada do histórico de violations do tenant atual.
 * Ordenada por createdAt desc (mais recentes primeiro).
 *
 *   { total, page, limit, items: [{ id, adId, severity, violationType,
 *     status, attempts, detectedAt, createdAt, finishedAt, error,
 *     upstreamStatus, upstreamLatencyMs }] }
 */
const STATUS_BY_LOWER: Record<string, RawStatus> = {
  queued: 'QUEUED',
  active: 'ACTIVE',
  completed: 'COMPLETED',
  failed: 'FAILED',
};

const violationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /* limit clampa em 100 em vez de rejeitar — UX mais clemente pro consumer */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, 100)),
  status: z.enum(['queued', 'active', 'completed', 'failed']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

tenantsRouter.get('/tenants/me/violations', async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }

  const parsed = violationsQuerySchema.safeParse((req as unknown as Request).query);
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors);
    return res.status(400).json({
      error: `Query inválida: ${fields.join(', ')}`,
      details: parsed.error.flatten(),
    });
  }

  try {
    await requireMembership(claims.sub, claims.tenantId);
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 500).json({ error: e.message });
  }

  const { page, limit, status, severity } = parsed.data;
  const where: { tenantId: string; status?: RawStatus; severity?: RawSeverity } = {
    tenantId: claims.tenantId,
  };
  if (status) where.status = STATUS_BY_LOWER[status];
  if (severity) where.severity = severity;

  const [total, rows] = await Promise.all([
    prisma.violation.count({ where }),
    prisma.violation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  const items = rows.map((v) => ({
    id: v.id,
    adId: v.adId,
    severity: v.severity,
    violationType: v.violationType,
    status: STATUS_LOWERCASE[v.status],
    attempts: v.attempts,
    detectedAt: v.detectedAt instanceof Date ? v.detectedAt.toISOString() : v.detectedAt,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    finishedAt: v.finishedAt instanceof Date ? v.finishedAt.toISOString() : null,
    error: v.errorMessage,
    upstreamStatus: v.upstreamStatus,
    upstreamLatencyMs: v.upstreamLatencyMs,
  }));

  return res.json({ total, page, limit, items });
});

/* ── Webhook secret: visualizar + rotacionar (OWNER only) ────────── */

async function requireOwnerRole(userId: string, tenantId: string): Promise<void> {
  const m = await prisma.membership.findFirst({
    where: { userId, tenantId },
    select: { role: true },
  });
  if (!m) {
    throw Object.assign(new Error('sem acesso a esse workspace'), { status: 403 });
  }
  if (m.role !== 'OWNER') {
    throw Object.assign(new Error('apenas owners podem gerenciar o webhook secret'), {
      status: 403,
    });
  }
}

/**
 * GET /tenants/me/webhook-secret
 *
 * Retorna o secret atual do tenant pra que owner copie e configure no
 * cliente que dispara webhooks (Meta Ads, etc). Auto-gera se ainda for null
 * (rows pre-Sprint-1 que vieram da migration sem default).
 *
 * Apenas role OWNER pode ver — secret é credential equivalente.
 */
tenantsRouter.get('/tenants/me/webhook-secret', async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) return res.status(401).json({ error: 'não autenticado' });

  try {
    await requireOwnerRole(claims.sub, claims.tenantId);
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 500).json({ error: e.message });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: claims.tenantId },
    select: { webhookSecret: true },
  });
  if (!tenant) return res.status(404).json({ error: 'workspace não encontrado' });

  /* Backfill on read pra tenants legados que vieram da migration null. */
  let secret = tenant.webhookSecret;
  if (!secret) {
    secret = generateWebhookSecret();
    await prisma.tenant.update({
      where: { id: claims.tenantId },
      data: { webhookSecret: secret },
    });
  }

  return res.json({
    secret,
    instructions:
      'Compute HMAC-SHA256(rawBody, secret) e envie como header `X-FURY-Signature: sha256=<hex>` em POST /webhook/violation. Verificação é opt-in via WEBHOOK_REQUIRE_SIGNATURE=true no backend.',
  });
});

/**
 * POST /tenants/me/webhook-secret/rotate
 *
 * Gera novo secret + invalida o antigo. Use quando o secret atual vazar
 * ou periodicamente (rotação por boas práticas).
 *
 * Protegido por CSRF (state-changing) + OWNER role.
 */
tenantsRouter.post(
  '/tenants/me/webhook-secret/rotate',
  csrfProtection,
  async (req: AuthedRequest, res: Response) => {
    const claims = req.auth;
    if (!claims) return res.status(401).json({ error: 'não autenticado' });

    try {
      await requireOwnerRole(claims.sub, claims.tenantId);
    } catch (err) {
      const e = err as Error & { status?: number };
      return res.status(e.status ?? 500).json({ error: e.message });
    }

    const secret = generateWebhookSecret();
    await prisma.tenant.update({
      where: { id: claims.tenantId },
      data: { webhookSecret: secret },
    });

    void recordAudit({
      action: 'WEBHOOK_SECRET_ROTATE',
      userId: claims.sub,
      tenantId: claims.tenantId,
      req,
    });

    return res.json({ secret });
  },
);
