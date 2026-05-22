import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { violationQueue } from '../queue/violationQueue.js';

export const deadLetterRouter: Router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toIso(ms: number | undefined | null): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * GET /jobs/failed?limit=N — lists jobs that exhausted retries.
 *
 * Triage tool: lets an operator see *what* is failing and *why* without
 * touching Redis directly. Default 50 last jobs, hard cap 200.
 */
deadLetterRouter.get('/jobs/failed', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'query inválida',
      details: parsed.error.flatten(),
    });
  }
  const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rawJobs = await violationQueue.getJobs(['failed'], 0, limit - 1);
  const jobs = rawJobs.map((j) => ({
    jobId: String(j.id),
    attempts: j.attemptsMade,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    failedReason: j.failedReason ?? null,
    data: j.data,
    queuedAt: toIso(j.timestamp),
    failedAt: toIso(j.finishedOn),
  }));

  return res.json({ total: jobs.length, jobs });
});
