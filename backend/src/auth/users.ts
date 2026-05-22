import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * In-memory user store for development.
 *
 * Replace with a real DB (Postgres/Prisma/Drizzle) in production.
 * The shape and async API is already DB-friendly.
 */

export type StoredUser = {
  id: string;
  name: string;
  email: string; /* lowercased */
  passwordHash: string;
  createdAt: string; /* ISO */
};

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

const users = new Map<string, StoredUser>(); /* keyed by email */

export function publicView(u: StoredUser): PublicUser {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

export function findByEmail(email: string): StoredUser | undefined {
  return users.get(email.toLowerCase());
}

export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<StoredUser> {
  const lower = email.toLowerCase();
  if (users.has(lower)) {
    throw Object.assign(new Error('Já existe uma conta com esse email.'), {
      field: 'email',
      status: 409,
    });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const u: StoredUser = {
    id: randomUUID(),
    name,
    email: lower,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.set(lower, u);
  return u;
}

export async function verifyPassword(user: StoredUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}
