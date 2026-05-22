import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().optional(),
  QUEUE_NAME: z.string().default('ad-processing'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  UPSTREAM_URL: z.string().url().default('https://jsonplaceholder.typicode.com/posts/1'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /* Postgres (Neon) — Prisma também lê esses direto do process.env, mas
     validar aqui faz o boot falhar cedo se vier vazio. */
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  /* Google OAuth — opcionais; rotas /auth/google retornam 503 se faltar
     algum, em vez de quebrar o boot do backend. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
