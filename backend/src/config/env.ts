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
  /* CORS — lista de origens permitidas separadas por vírgula. FRONTEND_URL
     entra automaticamente; isso é pro caso de múltiplas (staging, preview). */
  CORS_ORIGINS: z.string().optional(),
  /* Token pra proteger /metrics em produção (Prometheus scraper passa via
     header). Vazio = endpoint público (ok em dev). */
  METRICS_TOKEN: z.string().optional(),
  /* Se true, /webhook/violation requer header X-FURY-Signature válido
     (HMAC-SHA256 do body com webhookSecret do tenant). Default false
     pra não quebrar curl examples do desafio. Em prod recomendado true. */
  WEBHOOK_REQUIRE_SIGNATURE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  /* Resend (https://resend.com) — sender de email transactional.
     Quando RESEND_API_KEY está setado + RESEND_FROM válido, sendVerificationEmail
     envia de verdade. Caso contrário, loga o link só (dev mode). */
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().email().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
