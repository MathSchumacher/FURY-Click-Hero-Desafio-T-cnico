import { env } from './config/env.js';
import { redisConnection } from './config/redis.js';
import { logger } from './lib/logger.js';
import { QUEUE_NAME } from './queue/violationQueue.js';
import { createTakedownWorker } from './worker/createWorker.js';
import { UPSTREAM_URL } from './worker/upstream.js';

/**
 * Takedown worker — BullMQ wiring only.
 *
 * Business logic lives in ./worker/processor.ts (unit-tested).
 * Upstream HTTP client lives in ./worker/upstream.ts (unit-tested).
 */

const worker = createTakedownWorker(QUEUE_NAME, redisConnection, env.WORKER_CONCURRENCY);

worker.on('failed', (job, err) => {
  const attempts = job?.attemptsMade ?? 0;
  const max = job?.opts.attempts ?? 0;
  const final = attempts >= max;
  logger.error(
    { jobId: job?.id, attempts, maxAttempts: max, final, err: err.message },
    final ? 'takedown:failed:final' : 'takedown:failed:will_retry',
  );
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, attempts: job.attemptsMade }, 'takedown:done');
});

worker.on('ready', () => {
  logger.info(
    { queue: QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY, upstream: UPSTREAM_URL },
    'worker:ready',
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker:shutdown:start');
  await worker.close();
  await redisConnection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
