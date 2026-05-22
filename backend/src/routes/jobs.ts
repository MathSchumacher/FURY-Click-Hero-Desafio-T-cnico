import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const jobsRouter: Router = Router();

const STATUS_MAP = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

/**
 * GET /jobs/:id
 *
 *   401 → sem token PASETO no Authorization header
 *   404 → registro não existe, OU pertence a outro tenant (privacy by default
 *         — não confirmamos a existência pra evitar enumeração via timing)
 *   200 → { jobId, status, attempts, result, error }
 *
 * O lookup é escopado a `claims.tenantId` — impede IDOR via jobId
 * determinístico (`tenant_slug__ad_id`), que de outra forma permitiria a
 * qualquer user logado ler jobs de tenants alheios advinhando o slug.
 *
 * Fonte de verdade: tabela Violation no Postgres. Worker grava transições;
 * Redis tem job ativo na fila (com TTL), histórico permanente vive aqui.
 */
jobsRouter.get('/jobs/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'job id é obrigatório' });
  }

  const v = await prisma.violation.findFirst({
    where: { jobId: id, tenantId: claims.tenantId },
  });
  if (!v) {
    return res.status(404).json({ error: 'job não encontrado' });
  }

  const isCompleted = v.status === 'COMPLETED';
  const result = isCompleted
    ? {
        upstreamStatus: v.upstreamStatus,
        upstreamLatencyMs: v.upstreamLatencyMs,
        adId: v.adId,
        tenantId: v.tenantId,
        finishedAt: v.finishedAt?.toISOString() ?? null,
      }
    : null;

  return res.json({
    jobId: v.jobId,
    status: STATUS_MAP[v.status],
    attempts: v.attempts,
    result,
    error: v.errorMessage,
  });
});
