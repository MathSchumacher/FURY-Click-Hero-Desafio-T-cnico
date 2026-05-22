import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const deadLetterRouter: Router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /jobs/failed?limit=N — lista violations que esgotaram retries.
 *
 *   401 → sem auth
 *   400 → query inválida
 *   200 → { total, jobs: [...] } escopado ao tenant do user logado
 *
 * Lê da tabela Violation (status=FAILED) em vez do BullMQ queue, pra
 * filtrar nativamente por tenantId. O queue global continha jobs de
 * todos tenants — vazamento cross-tenant de stack traces.
 */
deadLetterRouter.get('/jobs/failed', requireAuth, async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'query inválida',
      details: parsed.error.flatten(),
    });
  }
  const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await prisma.violation.findMany({
    where: { tenantId: claims.tenantId, status: 'FAILED' },
    orderBy: { finishedAt: 'desc' },
    take: limit,
  });

  const jobs = rows.map((v) => ({
    jobId: v.jobId,
    adId: v.adId,
    severity: v.severity,
    violationType: v.violationType,
    attempts: v.attempts,
    error: v.errorMessage,
    createdAt: v.createdAt.toISOString(),
    finishedAt: v.finishedAt?.toISOString() ?? null,
  }));

  return res.json({ total: jobs.length, jobs });
});
