import { OAuth2Client } from 'google-auth-library';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { authLimiter } from '../lib/rateLimit.js';
import { recordAudit } from '../lib/audit.js';
import { consumeOAuthState, issueOAuthState, type OAuthIntent } from '../auth/oauthState.js';
import { signToken, verifyToken, type AuthClaims } from '../auth/paseto.js';
import { isRevoked, revokeToken } from '../auth/revocation.js';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import bcrypt from 'bcryptjs';
import {
  consumeVerificationToken,
  issueVerificationToken,
  sendVerificationEmail,
} from '../auth/verification.js';
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
import { prisma } from '../lib/prisma.js';

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
    void recordAudit({
      action: 'USER_REGISTER',
      userId: pub.id,
      tenantId: tenant.id,
      metadata: { email: pub.email, tenantSlug: tenant.slug },
      req,
    });
    setSessionCookie(res, token);
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
    void recordAudit({
      action: 'USER_LOGIN_FAIL',
      userId: user?.id ?? null,
      metadata: { email: email.toLowerCase(), reason: user ? 'wrong_password' : 'unknown_email' },
      req,
    });
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
  void recordAudit({
    action: 'USER_LOGIN_SUCCESS',
    userId: pub.id,
    tenantId,
    req,
  });
  setSessionCookie(res, token);
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
 * Intent passada via query (?intent=login|register) — sanitiza pro union.
 *   - login: só loga users existentes; novos → erro account_not_found
 *   - register: cria User+Tenant se não existe, ou loga + vincula se já
 *
 * O state real do OAuth não é só "login"/"register" — agora é
 * base64({ nonce, intent }) com nonce em Redis (TTL 10min). Isso impede
 * CSRF: atacante não consegue forjar um callback válido sem ter primeiro
 * iniciado o flow (e Redis ter armazenado o nonce).
 */
function parseIntent(raw: unknown): OAuthIntent {
  return raw === 'register' ? 'register' : 'login';
}

/**
 * GET /auth/google?intent=login|register
 *
 * Inicia o fluxo OAuth: gera nonce + grava em Redis + encoda no state.
 * Redireciona pro consentimento do Google.
 */
authRouter.get('/auth/google', async (req: Request, res: Response) => {
  const client = googleClient();
  if (!client) {
    return res.status(503).json({ error: 'Google sign-in não está configurado neste ambiente.' });
  }
  const intent = parseIntent(req.query.intent);
  const state = await issueOAuthState(intent);
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
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

  /* Valida + consome o nonce do state (CSRF guard A6). Se inválido,
     significa que o callback foi forjado OU o nonce expirou (>10min). */
  const rawState = typeof req.query.state === 'string' ? req.query.state : null;
  const intent = rawState ? await consumeOAuthState(rawState) : null;
  if (!intent) {
    logger.warn({ rawState }, 'auth:google:invalid_state');
    res.redirect(`${env.FRONTEND_URL}/auth/callback?error=invalid_state`);
    return;
  }

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
    let wasNew = false;
    let wasLinked = false;
    if (intent === 'login') {
      /* Login: só aceita user existente. Não cria, não vincula silenciosamente. */
      resolved = await findGoogleUser(profile);
      if (!resolved) {
        void recordAudit({
          action: 'USER_LOGIN_FAIL',
          metadata: { email: profile.email, via: 'google', reason: 'no_account' },
          req,
        });
        res.redirect(`${env.FRONTEND_URL}/auth/callback?error=account_not_found`);
        return;
      }
    } else {
      /* Register: cria User+Tenant se novo, ou vincula googleId se email já existe. */
      const before = await findGoogleUser(profile);
      resolved = await findOrCreateGoogleUser(profile);
      wasNew = before === null;
      wasLinked =
        !wasNew && before !== null && before.user.googleId !== resolved.user.googleId;
    }

    const auditAction = wasNew
      ? 'USER_GOOGLE_SIGNUP'
      : wasLinked
        ? 'USER_GOOGLE_LINK'
        : 'USER_LOGIN_SUCCESS';
    void recordAudit({
      action: auditAction,
      userId: resolved.user.id,
      tenantId: resolved.tenantId,
      metadata: { email: resolved.user.email, via: 'google' },
      req,
    });

    const pub = publicView(resolved.user);
    const token = await signToken({
      sub: pub.id,
      name: pub.name,
      email: pub.email,
      tenantId: resolved.tenantId,
    });

    setSessionCookie(res, token);
    /* Mantém ?token=... no redirect durante transição — frontend usa
       enquanto a migração pra cookies não completa. Quando concluir,
       remover o query param (token só vive no cookie HttpOnly). */
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

/* ── Middleware: require a valid PASETO token ────────────────────── */
export interface AuthedRequest extends Request {
  auth?: AuthClaims;
}

/**
 * Extrai token de: 1) cookie `fury_session` (preferencial — HttpOnly),
 * 2) Authorization: Bearer (fallback pra CLI/API clients durante transição).
 */
function tokenFromRequest(req: AuthedRequest): string | null {
  /* req.cookies vem do cookie-parser middleware. Tipo do Express é
     Record<string, any>, então narrow antes de usar. */
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const fromCookie = cookies?.[SESSION_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  const header = req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1] ?? null;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'token ausente' });
    return;
  }
  const claims = await verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'token inválido ou expirado' });
    return;
  }
  /* Revocation check (M3): jti gravado em Redis no logout. */
  if (await isRevoked(claims.jti)) {
    res.status(401).json({ error: 'token revogado' });
    return;
  }
  req.auth = claims;
  next();
}

/* ── Email verification + password reset ─────────────────────────── */

const forgotSchema = z.object({ email: z.string().email().max(120) }).strict();
const resetSchema = z
  .object({
    token: z.string().min(32).max(128),
    password: z.string().min(8).max(120),
  })
  .strict();
const confirmEmailSchema = z.object({ token: z.string().min(32).max(128) }).strict();

/**
 * POST /auth/forgot-password
 *
 * Sempre responde 200 com mensagem genérica — não revela se o email
 * existe (anti-enumeração). Internamente: se o user existir, gera token
 * + envia email (em dev, link aparece no log).
 */
authRouter.post(
  '/auth/forgot-password',
  authLimiter,
  async (req: Request, res: Response) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'email inválido', field: 'email' });
    }
    const email = parsed.data.email.toLowerCase();
    const user = await findByEmail(email);

    if (user) {
      const issued = await issueVerificationToken(user.id, 'PASSWORD_RESET');
      const link = `${env.FRONTEND_URL}/auth/reset-password?token=${encodeURIComponent(issued.raw)}`;
      await sendVerificationEmail({
        to: email,
        kind: 'password_reset',
        link,
        verificationId: issued.id,
      });
      void recordAudit({
        action: 'USER_PASSWORD_RESET_REQUEST',
        userId: user.id,
        metadata: { email },
        req,
      });
    }

    /* Resposta uniforme — sempre 200 mesmo se user não existe */
    return res.json({
      ok: true,
      message: 'Se houver conta com esse email, enviamos um link de reset.',
    });
  },
);

/**
 * POST /auth/reset-password
 *
 * Body: { token, password }. Consome o token, atualiza passwordHash,
 * marca emailVerified=true (provar acesso ao email serve como verificação
 * implícita), revoga sessions ativas via increment de uma column? Não,
 * cobertura é ter o user trocar senha + deslogar manualmente.
 */
authRouter.post('/auth/reset-password', authLimiter, async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: issue?.message ?? 'payload inválido',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : '_',
    });
  }
  const { token, password } = parsed.data;
  const userId = await consumeVerificationToken(token, 'PASSWORD_RESET');
  if (!userId) {
    return res.status(400).json({ error: 'token inválido ou expirado', field: 'token' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, emailVerified: true },
  });

  void recordAudit({
    action: 'USER_PASSWORD_RESET_COMPLETE',
    userId,
    req,
  });

  return res.json({ ok: true });
});

/**
 * POST /auth/verify-email/request
 *
 * Gera token de verificação pro user autenticado e envia por email.
 * Idempotent — invalida tokens anteriores (do mesmo propósito) ao criar.
 */
authRouter.post(
  '/auth/verify-email/request',
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    const claims = req.auth;
    if (!claims) return res.status(401).json({ error: 'não autenticado' });
    if (!claims.email) return res.status(400).json({ error: 'email ausente no token' });

    const issued = await issueVerificationToken(claims.sub, 'EMAIL_VERIFICATION');
    const link = `${env.FRONTEND_URL}/auth/verify-email?token=${encodeURIComponent(issued.raw)}`;
    await sendVerificationEmail({
      to: claims.email,
      kind: 'verify_email',
      link,
      verificationId: issued.id,
    });
    void recordAudit({
      action: 'USER_EMAIL_VERIFY_REQUEST',
      userId: claims.sub,
      tenantId: claims.tenantId,
      metadata: { email: claims.email },
      req,
    });

    return res.json({ ok: true, message: 'Email enviado.' });
  },
);

/**
 * POST /auth/verify-email/confirm
 *
 * Body: { token } — público (token serve como auth implícito).
 * Marca user.emailVerified=true.
 */
authRouter.post(
  '/auth/verify-email/confirm',
  authLimiter,
  async (req: Request, res: Response) => {
    const parsed = confirmEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'token inválido', field: 'token' });
    }
    const userId = await consumeVerificationToken(parsed.data.token, 'EMAIL_VERIFICATION');
    if (!userId) {
      return res.status(400).json({ error: 'token inválido ou expirado', field: 'token' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    void recordAudit({
      action: 'USER_EMAIL_VERIFY_COMPLETE',
      userId,
      req,
    });
    return res.json({ ok: true });
  },
);

/**
 * POST /auth/logout
 *
 * Revoga o token atual gravando o jti em Redis até o exp natural.
 * Idempotent — chamar repetidas vezes é OK.
 */
authRouter.post('/auth/logout', requireAuth, async (req: AuthedRequest, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    return res.status(401).json({ error: 'não autenticado' });
  }
  if (claims.jti) {
    await revokeToken(claims.jti, claims.exp);
  }
  void recordAudit({
    action: 'USER_LOGOUT',
    userId: claims.sub,
    tenantId: claims.tenantId,
    req,
  });
  clearSessionCookie(res);
  return res.json({ ok: true });
});

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
