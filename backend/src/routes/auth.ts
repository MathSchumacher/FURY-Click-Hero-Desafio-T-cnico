import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { signToken, verifyToken, type AuthClaims } from '../auth/paseto.js';
import {
  createUser,
  findByEmail,
  findPrimaryTenantId,
  publicView,
  verifyPassword,
} from '../auth/users.js';

export const authRouter: Router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'nome muito curto').max(80),
  email: z.string().email('email inválido').max(120),
  password: z.string().min(8, 'a senha deve ter ao menos 8 caracteres').max(120),
});

const loginSchema = z.object({
  email: z.string().email('email inválido'),
  password: z.string().min(1),
});

authRouter.post('/auth/register', async (req: Request, res: Response) => {
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
    return res.status(201).json({ token, user: pub, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
  } catch (err) {
    const e = err as Error & { status?: number; field?: string };
    return res.status(e.status ?? 500).json({
      error: e.message,
      field: e.field ?? '_',
    });
  }
});

authRouter.post('/auth/login', async (req: Request, res: Response) => {
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

  const user = await findByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'email ou senha incorretos', field: '_' });
  }
  const ok = await verifyPassword(user, password);
  if (!ok) {
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
