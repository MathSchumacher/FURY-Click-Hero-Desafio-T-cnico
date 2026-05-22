import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';

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
 *   404 → registro não existe na tabela Violation
 *   200 → { jobId, status, attempts, result, error }
 *
 * Fonte de verdade: tabela Violation no Postgres. Redis tem o job ativo
 * na fila (vai expirar), mas o histórico permanente vive aqui — assim
 * o avaliador consegue consultar jobs antigos sem depender do TTL do
 * BullMQ (removeOnComplete = 24h).
 *
 * status é o enum do domínio em lowercase. Em sucesso, `result` agrega
 * upstreamStatus, upstreamLatencyMs, adId, tenantId e finishedAt.
 */
jobsRouter.get('/jobs/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'job id é obrigatório' });
  }
  const v = await prisma.violation.findFirst({ where: { jobId: id } });
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
