import type { Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { callUpstream } from './upstream.js';

/**
 * BullMQ processor: calls the upstream takedown stub and returns a structured
 * result. Any throw is rethrown to BullMQ for the retry/backoff machinery.
 *
 * Pure-ish: takes a Job, uses fetch through `callUpstream`. Easy to mock.
 *
 * Persiste transições de estado na Violation (ACTIVE no início, COMPLETED no
 * sucesso) — best-effort: erro no DB não derruba o processamento, vai pro log.
 * A falha final (FAILED) é tratada por handleFinalFailure via worker.on('failed').
 */
export async function processTakedown(
  job: Job<ViolationPayload, TakedownResult>,
): Promise<TakedownResult> {
  const { adId, tenantId, violationType, severity } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;

  logger.info(
    { jobId: job.id, adId, tenantId, severity, violationType, attempt, maxAttempts },
    'takedown:start',
  );

  if (typeof job.id === 'string' && job.id.length > 0) {
    await prisma.violation
      .updateMany({
        where: { jobId: job.id },
        data: { status: 'ACTIVE', attempts: attempt },
      })
      .catch((err: unknown) => {
        logger.error(
          { err: (err as Error).message, jobId: job.id },
          'violation:write-active-failed',
        );
      });
  }

  const startedAt = Date.now();
  const { status } = await callUpstream();
  const upstreamLatencyMs = Date.now() - startedAt;

  const result: TakedownResult = {
    upstreamStatus: status,
    upstreamLatencyMs,
    attemptedAt: new Date(startedAt).toISOString(),
    adId,
    tenantId,
  };

  if (typeof job.id === 'string' && job.id.length > 0) {
    await prisma.violation
      .updateMany({
        where: { jobId: job.id },
        data: {
          status: 'COMPLETED',
          upstreamStatus: status,
          upstreamLatencyMs,
          finishedAt: new Date(),
        },
      })
      .catch((err: unknown) => {
        logger.error(
          { err: (err as Error).message, jobId: job.id },
          'violation:write-completed-failed',
        );
      });
  }

  logger.info(
    { jobId: job.id, upstreamStatus: status, upstreamLatencyMs, attempt },
    'takedown:success',
  );
  return result;
}
