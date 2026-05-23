import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const auditRouter: Router = Router();

/**
 * Audit log endpoint — visualização paginada de eventos sensíveis do tenant.
 *
 * Decisões de segurança:
 *   - OWNER-only: audit data contém IP, user-agent, metadata sensível.
 *     Não é informação que MEMBER comum precisa ver.
 *   - Multi-tenant isolation: filtra estritamente por tenantId das claims.
 *     Nunca vaza events de outros workspaces.
 *   - Filtro por action via zod enum (rejeita valores fora da union).
 */

auditRouter.use(requireAuth);

async function requireOwnerRole(userId: string, tenantId: string): Promise<void> {
  const m = await prisma.membership.findFirst({ where: { userId, tenantId } });
  if (!m || m.role !== 'OWNER') {
    throw Object.assign(new Error('apenas OWNER pode visualizar audit log'), { status: 403 });
  }
}

/* z.nativeEnum(AuditAction) garante que filtros venham do enum do Prisma — se
   adicionarmos uma action nova no schema, o filter aceita automaticamente. */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, 100)),
  action: z.nativeEnum(AuditAction).optional(),
});

auditRouter.get('/audit/me', async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) return res.status(401).json({ error: 'não autenticado' });

  const parsed = querySchema.safeParse((req as unknown as Request).query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'query inválida',
      details: parsed.error.flatten(),
    });
  }

  try {
    await requireOwnerRole(claims.sub, claims.tenantId);
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 500).json({ error: e.message });
  }

  const { page, limit, action } = parsed.data;
  const where: { tenantId: string; action?: AuditAction } = {
    tenantId: claims.tenantId,
  };
  if (action) where.action = action;

  const [total, rows] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    userId: r.userId,
    tenantId: r.tenantId,
    metadata: r.metadata,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  return res.json({ total, page, limit, items });
});
