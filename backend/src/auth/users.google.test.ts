import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleProfile } from './users.js';

type FakeUser = {
  id: string;
  email: string;
  name: string;
  googleId: string | null;
  avatarUrl: string | null;
  passwordHash: string | null;
};

const fakeUsersByEmail = new Map<string, FakeUser>();
const fakeUsersByGoogleId = new Map<string, FakeUser>();
const fakeMemberships = new Map<string, string>(); /* userId → tenantId */

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { email?: string; googleId?: string } }) => {
        if (typeof where.email === 'string') return fakeUsersByEmail.get(where.email) ?? null;
        if (typeof where.googleId === 'string')
          return fakeUsersByGoogleId.get(where.googleId) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const u = [...fakeUsersByEmail.values()].find((x) => x.id === where.id);
        if (!u) throw new Error('user not found');
        const updated = { ...u, ...data };
        fakeUsersByEmail.set(updated.email, updated);
        if (updated.googleId) fakeUsersByGoogleId.set(updated.googleId, updated);
        return updated;
      },
    },
    membership: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const tenantId = fakeMemberships.get(where.userId);
        return tenantId ? { tenantId } : null;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        user: {
          create: async ({ data }: { data: Omit<FakeUser, 'id'> & { id?: string } }) => {
            const id = data.id ?? `user_${Math.random().toString(36).slice(2, 8)}`;
            const u: FakeUser = {
              id,
              email: data.email,
              name: data.name,
              googleId: data.googleId ?? null,
              avatarUrl: data.avatarUrl ?? null,
              passwordHash: data.passwordHash ?? null,
            };
            fakeUsersByEmail.set(u.email, u);
            if (u.googleId) fakeUsersByGoogleId.set(u.googleId, u);
            return u;
          },
        },
        tenant: {
          create: async ({
            data,
          }: {
            data: { name: string; members: { create: { userId: string; role: string } } };
          }) => {
            const id = `t_${Math.random().toString(36).slice(2, 8)}`;
            fakeMemberships.set(data.members.create.userId, id);
            return { id, name: data.name };
          },
        },
      };
      return fn(tx);
    },
  },
}));

type FindOrCreateFn = typeof import('./users.js').findOrCreateGoogleUser;
let findOrCreateGoogleUser: FindOrCreateFn;

beforeAll(async () => {
  ({ findOrCreateGoogleUser } = await import('./users.js'));
});

beforeEach(() => {
  fakeUsersByEmail.clear();
  fakeUsersByGoogleId.clear();
  fakeMemberships.clear();
});

const baseProfile: GoogleProfile = {
  googleId: 'goog_xxx',
  email: 'matheus@example.com',
  name: 'Matheus Schumacher',
  avatarUrl: 'https://lh3.googleusercontent.com/a/foo',
};

describe('findOrCreateGoogleUser', () => {
  it('Cenário 1: user já existe com mesmo googleId → reuse', async () => {
    /* seed: user com googleId */
    fakeUsersByGoogleId.set('goog_xxx', {
      id: 'u_existing',
      email: 'matheus@example.com',
      name: 'Matheus Schumacher',
      googleId: 'goog_xxx',
      avatarUrl: null,
      passwordHash: null,
    });
    fakeMemberships.set('u_existing', 't_existing');

    const { user, tenantId } = await findOrCreateGoogleUser(baseProfile);
    expect(user.id).toBe('u_existing');
    expect(tenantId).toBe('t_existing');
  });

  it('Cenário 2: user existe por email mas sem googleId → vincula', async () => {
    fakeUsersByEmail.set('matheus@example.com', {
      id: 'u_local',
      email: 'matheus@example.com',
      name: 'Matheus Schumacher',
      googleId: null,
      avatarUrl: null,
      passwordHash: 'hashed-pwd' /* tinha conta com senha */,
    });
    fakeMemberships.set('u_local', 't_local');

    const { user, tenantId } = await findOrCreateGoogleUser(baseProfile);
    expect(user.id).toBe('u_local');
    expect(user.googleId).toBe('goog_xxx');
    expect(tenantId).toBe('t_local');
  });

  it('Cenário 3: user novo → cria User + Tenant + Membership OWNER', async () => {
    const { user, tenantId } = await findOrCreateGoogleUser(baseProfile);
    expect(user.email).toBe('matheus@example.com');
    expect(user.googleId).toBe('goog_xxx');
    expect(user.passwordHash).toBeNull();
    expect(user.avatarUrl).toBe('https://lh3.googleusercontent.com/a/foo');
    expect(tenantId).toMatch(/^t_/);
    expect(fakeMemberships.get(user.id)).toBe(tenantId);
  });

  it('normaliza email pra lowercase antes de buscar', async () => {
    const upperProfile: GoogleProfile = { ...baseProfile, email: 'Matheus@Example.COM' };
    fakeUsersByEmail.set('matheus@example.com', {
      id: 'u_lower',
      email: 'matheus@example.com',
      name: 'Matheus',
      googleId: null,
      avatarUrl: null,
      passwordHash: 'pwd',
    });
    fakeMemberships.set('u_lower', 't_lower');

    const { user } = await findOrCreateGoogleUser(upperProfile);
    expect(user.id).toBe('u_lower'); /* matched by lowercased email */
  });
});
