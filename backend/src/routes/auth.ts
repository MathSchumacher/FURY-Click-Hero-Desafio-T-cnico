import { OAuth2Client } from 'google-auth-library';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { authLimiter } from '../lib/rateLimit.js';
import { signToken, verifyToken, type AuthClaims } from '../auth/paseto.js';
import {
  createUser,
  findByEmail,
  findGoogleUser,
  findOrCreateGoogleUser,
  findPrimaryTenantId,
  publicView,
  verifyPasswordSafe,
  type GoogleProfile,
} from '../auth/users.js';

export const authRouter: Router = Router();

const registerSchema = z
  .object({
    name: z.string().min(2, 'nome muito curto').max(80),
    email: z.string().email('email inválido').max(120),
    password: z.string().min(8, 'a senha deve ter ao menos 8 caracteres').max(120),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email('email inválido').max(120),
    password: z.string().min(1).max(120),
  })
  .strict();

authRouter.post('/auth/register', authLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return res.status(400).json({
      error: issue?.message ?? 'payload inválido',
      field: typeof field === 'string' ? field : '_',
    });
  }
  const { name, email, password } = parsed.data;

  try {
    const { user, tenant } = await createUser(name, email, password);
    const pub = publicView(user);
    const token = await signToken({
      sub: pub.id,
      name: pub.name,
      email: pub.email,
      tenantId: tenant.id,
    });
    return res
      .status(201)
      .json({ token, user: pub, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
  } catch (err) {
    const e = err as Error & { status?: number; field?: string };
    return res.status(e.status ?? 500).json({
      error: e.message,
      field: e.field ?? '_',
    });
  }
});

authRouter.post('/auth/login', authLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return res.status(400).json({
      error: issue?.message ?? 'payload inválido',
      field: typeof field === 'string' ? field : '_',
    });
  }
  const { email, password } = parsed.data;

  /* Timing-safe: roda bcrypt sempre, mesmo se user não existe, pra
     anular enumeração de email via diff de latência (A3 da auditoria). */
  const user = await findByEmail(email);
  const ok = await verifyPasswordSafe(user, password);
  if (!user || !ok) {
    return res.status(401).json({ error: 'email ou senha incorretos', field: '_' });
  }
  const tenantId = await findPrimaryTenantId(user.id);
  if (!tenantId) {
    /* Conta legada criada antes do tenant-auto. Não deveria acontecer com
       schema novo, mas é seguro retornar erro claro em vez de quebrar. */
    return res.status(409).json({
      error: 'Conta sem workspace associado. Contate o suporte.',
      field: '_',
    });
  }
  const pub = publicView(user);
  const token = await signToken({
    sub: pub.id,
    name: pub.name,
    email: pub.email,
    tenantId,
  });
  return res.json({ token, user: pub, tenant: { id: tenantId } });
});

/* ── Google OAuth — sign-in/sign-up via Google ────────────────────── */

/**
 * Singleton do OAuth2Client. Reusa configuração via env.
 * Retorna null se credenciais não estão configuradas (rotas retornam 503).
 */
function googleClient(): OAuth2Client | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return null;
  }
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}

/**
 * Intent passada via query (?intent=login|register) e propagada via state
 * do OAuth de volta no callback. Distingue:
 *   - login: só loga users existentes; novos → erro account_not_found
 *   - register: cria User+Tenant se não existe, ou loga + vincula se já
 */
type AuthIntent = 'login' | 'register';
function parseIntent(raw: unknown): AuthIntent {
  return raw === 'register' ? 'register' : 'login';
}

/**
 * GET /auth/google?intent=login|register
 *
 * Inicia o fluxo OAuth: redireciona o user pro consentimento do Google.
 * O `intent` é gravado no state pra sobreviver ao round-trip.
 */
authRouter.get('/auth/google', (req: Request, res: Response) => {
  const client = googleClient();
  if (!client) {
    return res.status(503).json({ error: 'Google sign-in não está configurado neste ambiente.' });
  }
  const intent = parseIntent(req.query.intent);
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state: intent,
  });
  res.redirect(url);
});

/**
 * GET /auth/google/callback
 *
 * Recebe o `code` do Google, troca por tokens, verifica o ID token,
 * find-or-create do User no banco, assina PASETO e redireciona pro frontend
 * com `?token=...`. Em erro, redireciona com `?error=...`.
 */
authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const client = googleClient();
  if (!client) {
    res.redirect(`${env.FRONTEND_URL}/auth/callback?error=not_configured`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const errorParam = typeof req.query.error === 'string' ? req.query.error : null;
  if (errorParam || !code) {
    res.redirect(
      `${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(errorParam ?? 'no_code')}`,
    );
    return;
  }

  const intent: AuthIntent = parseIntent(req.query.state);

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error('Google não retornou id_token.');
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new Error('Email do Google não verificado ou payload incompleto.');
    }

    const profile: GoogleProfile = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0] ?? 'Usuário',
      avatarUrl: payload.picture ?? null,
    };

    let resolved: { user: import('@prisma/client').User; tenantId: string } | null;
    if (intent === 'login') {
      /* Login: só aceita user existente. Não cria, não vincula silenciosamente. */
      resolved = await findGoogleUser(profile);
      if (!resolved) {
        res.redirect(`${env.FRONTEND_URL}/auth/callback?error=account_not_found`);
        return;
      }
    } else {
      /* Register: cria User+Tenant se novo, ou vincula googleId se email já existe. */
      resolved = await findOrCreateGoogleUser(profile);
    }

    const pub = publicView(resolved.user);
    const token = await signToken({
      sub: pub.id,
      name: pub.name,
      email: pub.email,
      tenantId: resolved.tenantId,
    });

    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
    return;
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message }, 'auth:google:callback:failed');
    res.redirect(
      `${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent('google_auth_failed')}`,
    );
    return;
  }
});

/* ── Middleware: require a valid PASETO token ── */
export interface AuthedRequest extends Request {
  auth?: AuthClaims;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    res.status(401).json({ error: 'token ausente' });
    return;
  }
  const token = m[1];
  if (!token) {
    res.status(401).json({ error: 'token ausente' });
    return;
  }
  const claims = await verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'token inválido ou expirado' });
    return;
  }
  req.auth = claims;
  next();
}

authRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
  const a = req.auth;
  if (!a) {
    res.status(401).json({ error: 'não autenticado' });
    return;
  }
  res.json({
    id: a.sub,
    name: a.name,
    email: a.email,
    tenantId: a.tenantId,
  });
});
