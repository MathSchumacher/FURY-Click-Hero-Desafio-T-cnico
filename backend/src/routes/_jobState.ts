import type { Job, JobState, JobType } from 'bullmq';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';

/**
 * States in which BullMQ considers the job "alive" and a new POST for the
 * same (tenantId, adId) should be deduplicated.
 *
 * Exported so the behavior is testable in isolation.
 */
export const IN_FLIGHT_STATES = ['waiting', 'active', 'delayed', 'waiting-children'] as const;

export type InFlightState = (typeof IN_FLIGHT_STATES)[number];

export function isInFlight(state: JobState | JobType | 'unknown'): boolean {
  return (IN_FLIGHT_STATES as readonly string[]).includes(state);
}

/**
 * Response shape required by the challenge spec for GET /jobs/:id:
 *   { jobId, status, attempts, result, error }
 */
export type JobStatusResponse = {
  jobId: string;
  status: string;
  attempts: number;
  result: TakedownResult | null;
  error: string | null;
};

export async function jobStatus(
  job: Job<ViolationPayload, TakedownResult>,
): Promise<JobStatusResponse> {
  const state = await job.getState();
  return {
    jobId: String(job.id),
    status: state,
    attempts: job.attemptsMade,
    /* BullMQ types these as non-null but they ARE undefined while the job is in
       waiting/active/delayed. Coalescing to null keeps the response contract. */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    result: job.returnvalue ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    error: job.failedReason ?? null,
  };
}
