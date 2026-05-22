import IORedis, { type RedisOptions } from 'ioredis';
import { env } from './env.js';

function buildRedisConnection(): IORedis {
  const baseOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };

  if (env.REDIS_URL) {
    return new IORedis(env.REDIS_URL, baseOptions);
  }

  return new IORedis({
    ...baseOptions,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD ?? undefined,
  });
}

export const redisConnection = buildRedisConnection();

redisConnection.on('error', (err: Error) => {
  console.error('[redis] connection error:', err.message);
});

redisConnection.on('connect', () => {
  console.log('[redis] connected');
});
