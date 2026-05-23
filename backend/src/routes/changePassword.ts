import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { authLimiter } from '../lib/rateLimit.js';
import { recordAudit } from '../lib/audit.js';
import { csrfProtection } from '../auth/csrf.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const changePasswordRouter: Router = Router();

/**
 * POST /auth/change-password
 *
 * Endpoint pra user autenticado trocar a própria senha. Diferente do
 * /auth/reset-password (que usa token de email), aqui exigimos a senha
 * ATUAL pra confirmar que é o legítimo dono da sessão (defesa contra
 * session hijack onde o atacante teria cookie mas não a senha).
 *
 * Camadas de proteção:
 *   - requireAuth (PASETO + revocation check)
 *   - csrfProtection (double-submit cookie)
 *   - authLimiter (10/15min — anti-brute pra current password)
 *   - bcrypt.compare em constant-time
 *   - Audit USER_PASSWORD_CHANGE
 */

const schema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword é obrigatório').max(120),
    newPassword: z
      .string()
      .min(8, 'a nova senha deve ter ao menos 8 caracteres')
      .max(120),
  })
  .strict();

changePasswordRouter.post(
  '/auth/change-password',
  authLimiter,
  csrfProtection,
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    const claims = req.auth;
    if (!claims) return res.status(401).json({ error: 'não autenticado' });

    const parsed = schema.safeParse((req as Request).body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({
        error: issue?.message ?? 'payload inválido',
        field: typeof issue?.path[0] === 'string' ? issue.path[0] : '_',
      });
    }

    const { currentPassword, newPassword } = parsed.data;

    try {
      const user = await prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user) {
        /* Token válido mas user sumiu (deleted account) — auth state stale */
        return res.status(401).json({ error: 'usuário não encontrado' });
      }

      /* Conta OAuth-only sem senha: precisa usar o flow de reset-password
         pra DEFINIR uma senha pela primeira vez (não trocar). */
      if (!user.passwordHash) {
        return res.status(400).json({
          error:
            'Esta conta foi criada via OAuth e ainda não tem senha. ' +
            'Use o fluxo "Esqueci a senha" pra definir uma.',
          field: 'currentPassword',
        });
      }

      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        void recordAudit({
          action: 'USER_LOGIN_FAIL',
          userId: claims.sub,
          tenantId: claims.tenantId,
          metadata: { reason: 'change_password_wrong_current' },
          req,
        });
        return res.status(401).json({
          error: 'senha atual incorreta',
          field: 'currentPassword',
        });
      }

      /* Nova senha hashed com cost=12 (mesma do register). */
      const newHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: claims.sub },
        data: { passwordHash: newHash },
      });

      void recordAudit({
        action: 'USER_PASSWORD_CHANGE',
        userId: claims.sub,
        tenantId: claims.tenantId,
        req,
      });

      return res.json({ ok: true });
    } catch (err) {
      const e = err as Error;
      logger.error({ err: e.message, userId: claims.sub }, 'auth:change_password:failed');
      return res.status(500).json({ error: 'Erro ao alterar senha. Tente novamente.' });
    }
  },
);
