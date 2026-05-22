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
  const base =
    name
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
  /* Contas OAuth-only não têm passwordHash. Não dá pra "loginar com senha"
     numa conta que nunca teve uma. */
  if (!user.passwordHash) return false;
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

/**
 * Sign-in via Google OAuth (find-or-create).
 *
 * Três cenários cobertos:
 *  1. User existe com mesmo googleId → reuse (login simples)
 *  2. User existe com mesmo email mas sem googleId → vincula a conta Google
 *     (UX melhor que forçar criar nova conta com email duplicado)
 *  3. User não existe → cria User + Tenant default + Membership OWNER
 *     (mesma transação do register tradicional, sem passwordHash)
 *
 * Sempre retorna o tenant ativo pra montar as claims do PASETO.
 */
export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

export async function findOrCreateGoogleUser(
  profile: GoogleProfile,
): Promise<{ user: StoredUser; tenantId: string }> {
  const lowerEmail = profile.email.toLowerCase();

  /* Cenário 1: já temos esse googleId */
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (byGoogleId) {
    const tenantId = await findPrimaryTenantId(byGoogleId.id);
    if (!tenantId) {
      throw Object.assign(new Error('Conta sem workspace associado.'), { status: 409 });
    }
    return { user: byGoogleId, tenantId };
  }

  /* Cenário 2: já existe com mesmo email, vincula o googleId */
  const byEmail = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (byEmail) {
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: profile.googleId, avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl },
    });
    const tenantId = await findPrimaryTenantId(linked.id);
    if (!tenantId) {
      throw Object.assign(new Error('Conta sem workspace associado.'), { status: 409 });
    }
    return { user: linked, tenantId };
  }

  /* Cenário 3: usuário novo — cria User + Tenant + Membership OWNER (sem senha) */
  const tenantName = `Workspace de ${firstNameOf(profile.name)}`;
  const { user, tenantId } = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: lowerEmail,
        name: profile.name,
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl ?? null,
      },
    });
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: makeSlug(tenantName),
        settings: { create: {} },
        members: { create: { userId: created.id, role: 'OWNER' } },
      },
    });
    return { user: created, tenantId: tenant.id };
  });
  return { user, tenantId };
}
