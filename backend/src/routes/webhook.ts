import { Prisma } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { webhookLimiter } from '../lib/rateLimit.js';
import { violationPayloadSchema } from '../schemas/violation.js';
import { buildJobId, jobOptionsFor, violationQueue } from '../queue/violationQueue.js';

export const webhookRouter: Router = Router();

/**
 * POST /webhook/violation
 *
 *   400 → payload inválido (Zod details)
 *   404 → tenantId não existe no banco (field=tenantId)
 *   200 → deduplicado (Violation existente está QUEUED/ACTIVE)
 *   202 → enfileirado (Violation criada OU re-enqueued após COMPLETED/FAILED)
 *
 * Idempotência race-free: o unique constraint @@unique([tenantId, jobId]) na
 * tabela Violation é o atomic primitive. Duas requests concorrentes pro mesmo
 * (tenant, ad) — apenas UMA consegue o INSERT; a outra pega P2002 e cai no
 * caminho de dedup. BullMQ.add com jobId também é idempotent (retorna job
 * existente), então não duplica na fila.
 *
 * O tenantId no payload aceita id (cuid) OU slug; resolvemos pro id pra
 * construir o jobId determinístico — alternar id/slug entre requests não
 * quebra dedup.
 */
webhookRouter.post('/webhook/violation', webhookLimiter, async (req: Request, res: Response) => {
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
  const detectedAt = new Date(payload.detectedAt);

  /* Tenta criar a Violation atomicamente. Prisma unique([tenantId, jobId])
     garante que apenas uma das requests concorrentes vence. */
  let isNewViolation = true;
  try {
    await prisma.violation.create({
      data: {
        tenantId: tenant.id,
        adId: payload.adId,
        violationType: payload.violationType,
        severity: payload.severity,
        detectedAt,
        jobId,
        status: 'QUEUED',
      },
    });
  } catch (err) {
    /* P2002 = unique constraint conflict — outro request já criou. Caminho de dedup. */
    if (
      err instanceof Prisma.PrismaClientKnownRequestError ||
      (err as { code?: string }).code === 'P2002'
    ) {
      isNewViolation = false;
    } else {
      throw err;
    }
  }

  if (!isNewViolation) {
    /* Existe — checa status pra decidir entre dedup (200) ou re-enqueue (202). */
    const existing = await prisma.violation.findUnique({
      where: { tenantId_jobId: { tenantId: tenant.id, jobId } },
    });
    if (existing && (existing.status === 'QUEUED' || existing.status === 'ACTIVE')) {
      log.info({ jobId, status: existing.status }, 'webhook:dedup');
      return res.status(200).json({
        jobId,
        status: existing.status.toLowerCase(),
        deduplicated: true,
        message: 'Já existe um job em andamento para esse adId + tenantId',
        requestId: req.id,
      });
    }
    /* COMPLETED ou FAILED — reseta pra QUEUED + re-enqueue */
    await prisma.violation.update({
      where: { tenantId_jobId: { tenantId: tenant.id, jobId } },
      data: {
        status: 'QUEUED',
        attempts: 0,
        upstreamStatus: null,
        upstreamLatencyMs: null,
        errorMessage: null,
        finishedAt: null,
        detectedAt,
        violationType: payload.violationType,
        severity: payload.severity,
      },
    });
  }

  /* BullMQ.add com unique jobId é idempotente — se já existe na fila,
     retorna o job existente sem duplicar. */
  const job = await violationQueue.add('takedown', payload, {
    jobId,
    ...jobOptionsFor(payload.severity),
  });

  log.info(
    {
      jobId: String(job.id),
      severity: payload.severity,
      violationType: payload.violationType,
      reused: !isNewViolation,
    },
    'webhook:enqueued',
  );

  return res.status(202).json({
    jobId: String(job.id),
    status: 'queued',
    severity: payload.severity,
    requestId: req.id,
  });
});
