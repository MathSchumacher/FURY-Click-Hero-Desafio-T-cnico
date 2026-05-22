import type { Request } from 'express';
import { Prisma, type AuditAction } from '@prisma/client';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/**
 * Audit log helper — append-only registro de ações sensíveis.
 *
 * Best-effort: erros de gravação viram log mas não derrubam a requisição.
 * O propósito é compliance/forense, não atomicidade com a operação primária.
 * Quando precisar de garantia atômica (ex: bookkeeping financeiro), usar
 * `prisma.$transaction([primaryWrite, auditWrite])` inline em vez deste helper.
 *
 * Convenções importantes:
 *   - NUNCA passar password/token raw em `metadata` — apenas metadados
 *     não-sensíveis (targetUserId, oldRole, email parcial, etc.).
 *   - `userId` pode ser null em ações pré-auth (login fail, register).
 *   - `tenantId` é escopado quando aplicável; null pra ações cross-tenant.
 */

type AuditInput = {
  action: AuditAction;
  userId?: string | null;
  tenantId?: string | null;
  metadata?: Prisma.InputJsonValue | undefined;
  req?: Request;
};

const TRUST_PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip'];

function getClientIp(req: Request | undefined): string | null {
  if (!req) return null;
  /* Express já popula req.ip quando trust proxy=1, mas reforçamos
     com fallback explícito caso headers venham diferentes. */
  if (req.ip) return req.ip;
  for (const h of TRUST_PROXY_HEADERS) {
    const v = req.header(h);
    if (typeof v === 'string' && v.length > 0) return v.split(',')[0]?.trim() ?? null;
  }
  return null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        tenantId: input.tenantId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        ipAddress: getClientIp(input.req),
        userAgent: input.req?.header('user-agent') ?? null,
      },
    });
  } catch (err) {
    logger.error(
      {
        err: (err as Error).message,
        action: input.action,
        userId: input.userId,
      },
      'audit:write-failed',
    );
  }
}
