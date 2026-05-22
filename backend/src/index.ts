import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

const isProd = env.NODE_ENV === 'production';

const app = express();

/* ── Render fica atrás de proxy reverso (Cloudflare). Sem trust proxy,
   req.ip vira o IP interno do load balancer e rate limit não funciona. */
app.set('trust proxy', 1);

/* ── Security headers via Helmet (CSP/HSTS/X-Frame-Options/etc).
   Configuração default já cobre o essencial. CSP é frouxa em dev pra
   permitir Vite HMR; em prod o frontend está em Netlify (origin separado),
   então o backend só serve JSON — CSP padrão é suficiente. */
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

/* ── CORS allowlist. Em dev libera localhost:5173/3001 + FRONTEND_URL.
   Em prod, só FRONTEND_URL + CORS_ORIGINS extras (preview deploys, staging).
   `credentials: true` pra futuro fluxo com HttpOnly cookies. */
const allowedOrigins = new Set<string>(
  [
    env.FRONTEND_URL,
    ...(isProd ? [] : ['http://localhost:5173', 'http://localhost:3001']),
    ...(env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  ].filter(Boolean),
);

app.use(
  cors({
    origin: (origin, cb) => {
      /* requests same-origin (sem header Origin) e ferramentas tipo curl
         passam — não há credenciais cross-origin pra proteger. */
      if (!origin) { cb(null, true); return; }
      if (allowedOrigins.has(origin)) { cb(null, true); return; }
      cb(new Error(`CORS: origin '${origin}' não permitido`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(requestId);

app.use(healthRouter);
app.use(metricsRouter);
app.use(webhookRouter);
app.use(deadLetterRouter);
app.use(jobsRouter);
app.use(authRouter);
app.use(tenantsRouter);

/**
 * Error handler global.
 * Em produção NUNCA vaza err.message/stack pro client — apenas requestId
 * pra correlação com logs (pino tem o detalhe completo). Em dev vaza
 * tudo pra DX.
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack, requestId: req.id }, 'http:unhandled');
  const isCorsError = err.message.startsWith('CORS:');
  if (isCorsError) {
    return res.status(403).json({ error: 'Origin não permitido', requestId: req.id });
  }
  if (isProd) {
    return res.status(500).json({ error: 'Internal server error', requestId: req.id });
  }
  return res
    .status(500)
    .json({ error: 'Internal server error', message: err.message, requestId: req.id });
});

app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      corsOrigins: [...allowedOrigins],
      routes: [
        'POST /webhook/violation',
        'GET  /jobs/:id           (auth)',
        'GET  /jobs/failed        (auth)',
        'GET  /metrics',
        'GET  /health',
        'POST /auth/register',
        'POST /auth/login',
        'GET  /auth/me            (auth)',
        'GET  /auth/google',
        'GET  /auth/google/callback',
        'GET  /tenants/me         (auth)',
        'GET  /tenants/me/stats   (auth)',
        'GET  /tenants/me/violations (auth)',
      ],
    },
    'http:listening',
  );
});
