import { Router, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { violationPayloadSchema } from '../schemas/violation.js';
import { buildJobId, jobOptionsFor, violationQueue } from '../queue/violationQueue.js';
import { isInFlight } from './_jobState.js';

export const webhookRouter: Router = Router();

/**
 * POST /webhook/violation
 *
 *   400 → payload inválido (Zod details)
 *   200 → deduplicado (já existe job em andamento para mesmo tenant+ad)
 *   202 → enfileirado
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
  const jobId = buildJobId(payload.adId, payload.tenantId);

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
