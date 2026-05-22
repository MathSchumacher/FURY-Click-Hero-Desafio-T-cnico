import { Queue, QueueEvents, type ConnectionOptions } from 'bullmq';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { DEFAULT_JOB_OPTIONS } from './jobOptions.js';

/**
 * Pure factory — no side effects until called. Lets tests build their own
 * Queue against an isolated Redis (e.g. testcontainers) without leaking
 * the production singleton.
 */
export function createViolationQueue(
  queueName: string,
  connection: ConnectionOptions,
): {
  queue: Queue<ViolationPayload, TakedownResult>;
  events: QueueEvents;
} {
  const queue = new Queue<ViolationPayload, TakedownResult>(queueName, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  const events = new QueueEvents(queueName, { connection });
  return { queue, events };
}
