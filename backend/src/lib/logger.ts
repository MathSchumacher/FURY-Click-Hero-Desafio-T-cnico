import pino, { type Logger } from 'pino';

/**
 * Structured logger. JSON in prod, pretty-printed in dev.
 * Fields like jobId/tenantId/severity become searchable in any log aggregator.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'fury-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
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
