import type { Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { callUpstream } from './upstream.js';

/**
 * BullMQ processor: calls the upstream takedown stub and returns a structured
 * result. Any throw is rethrown to BullMQ for the retry/backoff machinery.
 *
 * Pure-ish: takes a Job, uses fetch through `callUpstream`. Easy to mock.
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

  logger.info(
    { jobId: job.id, upstreamStatus: status, upstreamLatencyMs, attempt },
    'takedown:success',
  );
  return result;
}
