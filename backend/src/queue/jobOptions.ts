import type { JobsOptions } from 'bullmq';
import type { Severity } from '../schemas/violation.js';

/**
 * Pure helpers — no Redis side-effects. Safe to import in tests.
 */

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000 /* 1s → 2s → 4s */,
  },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

/** Severity-driven options. Higher severity = lower priority number = picked first. */
export function jobOptionsFor(severity: Severity): JobsOptions {
  switch (severity) {
    case 'CRITICAL':
      return { ...DEFAULT_JOB_OPTIONS, attempts: 5, priority: 1 };
    case 'HIGH':
      return { ...DEFAULT_JOB_OPTIONS, attempts: 4, priority: 2 };
    case 'MEDIUM':
      return { ...DEFAULT_JOB_OPTIONS, priority: 3 };
    case 'LOW':
    default:
      return { ...DEFAULT_JOB_OPTIONS, priority: 4 };
  }
}

/** Deterministic job id: blocks concurrent enqueues for the same (tenant, ad). */
export function buildJobId(adId: string, tenantId: string): string {
  return `${tenantId}:${adId}`;
}
