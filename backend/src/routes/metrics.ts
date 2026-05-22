import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { violationQueue } from '../queue/violationQueue.js';

export const metricsRouter: Router = Router();

/**
 * GET /metrics — Prometheus exposition format.
 *
 * Quando METRICS_TOKEN está setado (produção), exige header
 * `Authorization: Bearer <token>` — o Prometheus scraper configura via
 * `bearer_token_file`. Sem o env var (dev/local), endpoint é público.
 */
metricsRouter.get('/metrics', async (req: Request, res: Response) => {
  if (env.METRICS_TOKEN) {
    const auth = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (m?.[1] !== env.METRICS_TOKEN) {
      return res.status(401).type('text/plain').send('unauthorized');
    }
  }

  const counts = await violationQueue.getJobCounts();

  const lines: string[] = [
    '# HELP fury_jobs_total Total de jobs por estado na fila de takedown',
    '# TYPE fury_jobs_total gauge',
    `fury_jobs_total{state="waiting"} ${counts.waiting ?? 0}`,
    `fury_jobs_total{state="active"} ${counts.active ?? 0}`,
    `fury_jobs_total{state="delayed"} ${counts.delayed ?? 0}`,
    `fury_jobs_total{state="completed"} ${counts.completed ?? 0}`,
    `fury_jobs_total{state="failed"} ${counts.failed ?? 0}`,
    `fury_jobs_total{state="waiting-children"} ${counts['waiting-children'] ?? 0}`,
    '',
    '# HELP fury_process_uptime_seconds Tempo de processo em segundos',
    '# TYPE fury_process_uptime_seconds counter',
    `fury_process_uptime_seconds ${process.uptime().toFixed(0)}`,
    '',
  ];

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n'));
});
