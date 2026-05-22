import bcrypt from 'bcryptjs';
import type { Tenant, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * User store — respaldado por Postgres via Prisma.
 *
 * PASETO V4 continua dono da sessão (signing/verifying de tokens).
 * Aqui é a camada de persistência relacional de identidades.
 *
 * O register é um fluxo atômico: cria User + Tenant default + Membership OWNER
 * dentro de uma transação. Quem se registra vira dono de um workspace próprio
 * (modelo "Slack" — cada user nasce numa equipe que pode crescer convidando outros).
 */

export type StoredUser = User;
export type PublicUser = Omit<User, 'passwordHash' | 'updatedAt'>;

export function publicView(u: StoredUser): PublicUser {
  const { passwordHash: _ph, updatedAt: _ua, ...rest } = u;
  return rest;
}

export async function findByEmail(email: string): Promise<StoredUser | null> {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

/** Slug URL-safe a partir do nome, com sufixo randômico curto pra evitar colisão. */
function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') /* tira acentos */
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'workspace';
  const suffix = Math.random().toString(36).slice(2, 8); /* 6 chars base36 */
  return `${base}-${suffix}`;
}

/** Primeiro nome do usuário, fallback se vier vazio. */
function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'minha';
}

/**
 * Resultado do register: o User criado + o Tenant default + a Membership OWNER.
 * Auth route usa `user` pra montar PASETO claims; `tenantId` vira parte do token.
 */
export type CreatedAccount = { user: StoredUser; tenant: Tenant };

export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<CreatedAccount> {
  const lower = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) {
    throw Object.assign(new Error('Já existe uma conta com esse email.'), {
      field: 'email',
      status: 409,
    });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const tenantName = `Workspace de ${firstNameOf(name)}`;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email: lower, passwordHash },
    });
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: makeSlug(tenantName),
        settings: { create: {} } /* TenantSettings com defaults */,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    return { user, tenant };
  });
}

export async function verifyPassword(user: StoredUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

/**
 * Tenant "atual" do user — usado no login pra montar as claims do PASETO.
 *
 * MVP: pega a primeira Membership (cada user só tem 1 tenant default por enquanto).
 * Quando convites entrarem, frontend mostra um switcher e envia o tenantId desejado.
 */
export async function findPrimaryTenantId(userId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { tenantId: true },
  });
  return m?.tenantId ?? null;
}
