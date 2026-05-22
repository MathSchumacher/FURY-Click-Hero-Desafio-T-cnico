import pino, { type Logger } from 'pino';

/**
 * Structured logger. JSON em prod, pretty em dev.
 *
 * `redact` censura PII e secrets automaticamente em qualquer field com
 * nome de risco. Aplicado recursivo via wildcard `*.foo`. Substitui o
 * valor por '[REDACTED]' (em vez de remove) pra preservar shape do log
 * e facilitar debug do que aconteceu sem vazar conteúdo.
 */

const isDev = process.env.NODE_ENV !== 'production';

const REDACT_PATHS = [
  /* top-level */
  'password',
  'passwordHash',
  'token',
  'idToken',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  'apiKey',
  'clientSecret',
  /* aninhados em qualquer profundidade */
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.idToken',
  '*.accessToken',
  '*.refreshToken',
  '*.authorization',
  '*.apiKey',
  '*.clientSecret',
  /* requests/responses do Express */
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'fury-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname,service',
      },
    },
  }),
});
