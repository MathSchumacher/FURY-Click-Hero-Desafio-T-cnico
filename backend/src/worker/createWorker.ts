import { Worker, type ConnectionOptions } from 'bullmq';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { handleFinalFailure } from './onFailure.js';
import { processTakedown } from './processor.js';

/**
 * Factory que constrói um Worker contra uma conexão injetada.
 * Usado tanto pelo bootstrap de produção (src/worker.ts) quanto pelo E2E.
 *
 * Registra um listener de 'failed' que persiste FAILED na Violation
 * quando os retries esgotam.
 */
export function createTakedownWorker(
  queueName: string,
  connection: ConnectionOptions,
  concurrency = 5,
): Worker<ViolationPayload, TakedownResult> {
  const worker = new Worker<ViolationPayload, TakedownResult>(queueName, processTakedown, {
    connection,
    concurrency,
  });

  worker.on('failed', (job, err) => {
    if (job) {
      void handleFinalFailure(job, err);
    }
  });

  return worker;
}
