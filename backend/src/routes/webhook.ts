import { Router, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { violationPayloadSchema } from '../schemas/violation.js';
import { buildJobId, jobOptionsFor, violationQueue } from '../queue/violationQueue.js';
import { isInFlight } from './_jobState.js';

export const webhookRouter: Router = Router();

/**
 * POST /webhook/violation
 *
 *   400 → payload inválido (Zod details)
 *   404 → tenantId não existe no banco (field=tenantId)
 *   200 → deduplicado (já existe job em andamento para mesmo tenant+ad)
 *   202 → enfileirado (Violation persistida + job criado)
 *
 * O tenantId no payload pode ser o id do Tenant (cuid) ou o slug.
 * Internamente sempre resolvemos pro id pra construir o jobId determinístico,
 * o que mantém a idempotência mesmo se o usuário alternar id/slug entre requests.
 *
 * Each request gets a logger child with the correlation id set by the
 * requestId middleware. The jobId is logged alongside, so grepping either
 * one finds the full chain (HTTP → enqueue → worker).
 */
webhookRouter.post('/webhook/violation', async (req: Request, res: Response) => {
  const log = logger.child({ requestId: req.id });
  const parsed = violationPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    log.warn({ details: parsed.error.flatten() }, 'webhook:invalid_payload');
    return res.status(400).json({
      error: 'Payload inválido',
      details: parsed.error.flatten(),
      requestId: req.id,
    });
  }

  const payload = parsed.data;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: payload.tenantId }, { slug: payload.tenantId }] },
    select: { id: true },
  });
  if (!tenant) {
    log.warn({ tenantId: payload.tenantId }, 'webhook:tenant_not_found');
    return res.status(404).json({
      error: `Tenant '${payload.tenantId}' não encontrado. Crie um workspace via POST /auth/register.`,
      field: 'tenantId',
      requestId: req.id,
    });
  }

  const jobId = buildJobId(payload.adId, tenant.id);

  const existing = await violationQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (isInFlight(state)) {
      log.info({ jobId, state }, 'webhook:dedup');
      return res.status(200).json({
        jobId: String(existing.id),
        status: state,
        deduplicated: true,
        message: 'Já existe um job em andamento para esse adId + tenantId',
        requestId: req.id,
      });
    }
  }

  /* Persiste o Violation ANTES de enfileirar. Se a fila falhar, temos um
     registro órfão "QUEUED" no DB — preferível ao oposto (job processando
     sem registro pro worker atualizar). */
  await prisma.violation.upsert({
    where: { tenantId_jobId: { tenantId: tenant.id, jobId } },
    create: {
      tenantId: tenant.id,
      adId: payload.adId,
      violationType: payload.violationType,
      severity: payload.severity,
      detectedAt: new Date(payload.detectedAt),
      jobId,
      status: 'QUEUED',
    },
    update: {
      /* Re-submissão após completed/failed: reseta pra nova rodada */
      status: 'QUEUED',
      attempts: 0,
      upstreamStatus: null,
      upstreamLatencyMs: null,
      errorMessage: null,
      finishedAt: null,
    },
  });

  const job = await violationQueue.add('takedown', payload, {
    jobId,
    ...jobOptionsFor(payload.severity),
  });

  log.info(
    { jobId: String(job.id), severity: payload.severity, violationType: payload.violationType },
    'webhook:enqueued',
  );

  return res.status(202).json({
    jobId: String(job.id),
    status: 'queued',
    severity: payload.severity,
    requestId: req.id,
  });
});
