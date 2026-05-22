import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './lib/requestId.js';
import { webhookRouter } from './routes/webhook.js';
import { jobsRouter } from './routes/jobs.js';
import { deadLetterRouter } from './routes/deadletter.js';
import { healthRouter } from './routes/health.js';
import { metricsRouter } from './routes/metrics.js';
import { authRouter } from './routes/auth.js';
import { tenantsRouter } from './routes/tenants.js';
import './worker.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestId);

app.use(healthRouter);
app.use(metricsRouter);
app.use(webhookRouter);
app.use(deadLetterRouter);
app.use(jobsRouter);
app.use(authRouter);
app.use(tenantsRouter);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack, requestId: req.id }, 'http:unhandled');
  res.status(500).json({ error: 'Internal server error', message: err.message, requestId: req.id });
});

app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      routes: [
        'POST /webhook/violation',
        'GET  /jobs/:id',
        'GET  /jobs/failed',
        'GET  /metrics',
        'GET  /health',
        'POST /auth/register',
        'POST /auth/login',
        'GET  /auth/me',
      ],
    },
    'http:listening',
  );
});
