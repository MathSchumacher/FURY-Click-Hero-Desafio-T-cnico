import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/env.js';
import { redisConnection } from '../config/redis.js';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { DEFAULT_JOB_OPTIONS } from './jobOptions.js';

/** Re-export pure helpers so callers can use a single import path. */
export { DEFAULT_JOB_OPTIONS, jobOptionsFor, buildJobId } from './jobOptions.js';

export const QUEUE_NAME = env.QUEUE_NAME;

export const violationQueue = new Queue<ViolationPayload, TakedownResult>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const violationQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnection.duplicate(),
});
