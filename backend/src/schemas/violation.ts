import { z } from 'zod';

/**
 * Webhook payload — POST /webhook/violation
 *
 * Matches the FURY tech challenge spec exactly:
 *   { adId, tenantId, violationType, severity, detectedAt }
 *
 * Anything beyond these fields is rejected (`strict()`) — keeps the
 * external contract tight and prevents silent typos from sneaking in.
 */

export const VIOLATION_TYPES = ['PROHIBITED_TERM', 'BRAND_VIOLATION', 'COMPLIANCE_FAIL'] as const;
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];

export const violationPayloadSchema = z
  .object({
    adId: z.string({ required_error: 'adId é obrigatório' }).min(1, 'adId não pode ser vazio'),
    tenantId: z
      .string({ required_error: 'tenantId é obrigatório' })
      .min(1, 'tenantId não pode ser vazio'),
    violationType: z.enum(VIOLATION_TYPES, {
      errorMap: () => ({ message: `violationType deve ser um de: ${VIOLATION_TYPES.join(' | ')}` }),
    }),
    severity: z.enum(SEVERITIES, {
      errorMap: () => ({ message: `severity deve ser um de: ${SEVERITIES.join(' | ')}` }),
    }),
    detectedAt: z
      .string({ required_error: 'detectedAt é obrigatório' })
      .datetime({ message: 'detectedAt deve ser uma data ISO 8601 (ex: 2026-05-21T14:23:01Z)' }),
  })
  .strict();

export type ViolationPayload = z.infer<typeof violationPayloadSchema>;

/** Worker result shape — returned by the worker on success. */
export type TakedownResult = {
  upstreamStatus: number; /* HTTP status from JSONPlaceholder */
  upstreamLatencyMs: number; /* round-trip duration */
  attemptedAt: string; /* ISO timestamp the request was sent */
  adId: string;
  tenantId: string;
};
