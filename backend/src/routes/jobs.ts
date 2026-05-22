import { Router, type Request, type Response } from 'express';
import { violationQueue } from '../queue/violationQueue.js';
import { jobStatus } from './_jobState.js';

export const jobsRouter: Router = Router();

/**
 * GET /jobs/:id
 *
 *   404 → job não existe
 *   200 → { jobId, status, attempts, result, error }
 */
jobsRouter.get('/jobs/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'job id é obrigatório' });
  }
  const job = await violationQueue.getJob(id);
  if (!job) {
    return res.status(404).json({ error: 'job não encontrado' });
  }
  return res.json(await jobStatus(job));
});
