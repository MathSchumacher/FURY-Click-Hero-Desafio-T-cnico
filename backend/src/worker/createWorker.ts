import { Worker, type ConnectionOptions } from 'bullmq';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { processTakedown } from './processor.js';

/**
 * Factory that constructs a Worker against an injected connection.
 * Used by both the production bootstrap (src/worker.ts) and the E2E suite.
 */
export function createTakedownWorker(
  queueName: string,
  connection: ConnectionOptions,
  concurrency = 5,
): Worker<ViolationPayload, TakedownResult> {
  return new Worker<ViolationPayload, TakedownResult>(queueName, processTakedown, {
    connection,
    concurrency,
  });
}
