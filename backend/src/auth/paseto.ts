import { V4 } from 'paseto';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

/**
 * PASETO V4.public — Ed25519 asymmetric signing.
 *
 * Tokens are signed with a private key and can be verified with the
 * corresponding public key. Tokens contain claims (sub, iat, exp, ...) and
 * are tamper-evident.
 *
 * In production, keys MUST be persisted (e.g., from env / KMS / vault).
 * In dev, we generate a fresh keypair on boot — perfectly fine since
 * tokens issued by a previous boot become invalid (which is what you want
 * during local development anyway).
 */

let cachedKeys: { secretKey: KeyObject; publicKey: KeyObject } | null = null;

function getKeys(): { secretKey: KeyObject; publicKey: KeyObject } {
  if (cachedKeys) return cachedKeys;

  const fromEnv = process.env.PASETO_V4_SECRET_KEY_PEM;
  const fromEnvPublic = process.env.PASETO_V4_PUBLIC_KEY_PEM;
  if (fromEnv && fromEnvPublic) {
    cachedKeys = {
      secretKey: createPrivateKey({ key: fromEnv, format: 'pem' }),
      publicKey: createPublicKey({ key: fromEnvPublic, format: 'pem' }),
    };
    return cachedKeys;
  }

  /* Generate an ephemeral Ed25519 keypair for development */
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  cachedKeys = { secretKey: privateKey, publicKey };
  console.log('[paseto] ephemeral Ed25519 keypair generated (dev mode)');
  return cachedKeys;
}

export type AuthClaims = {
  sub: string; // user id
  email: string;
  name: string;
  tenantId: string; // tenant ativo do usuário (default = workspace pessoal)
  iat?: string;
  exp?: string;
};

const ISSUER = 'fury';
const AUDIENCE = 'fury-app';
const DEFAULT_EXP = '12h';

/** Sign a PASETO V4.public token containing the given user claims. */
export async function signToken(
  claims: AuthClaims,
  expiresIn: string = DEFAULT_EXP,
): Promise<string> {
  const { secretKey } = getKeys();
  return V4.sign(
    {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      tenantId: claims.tenantId,
    },
    secretKey,
    {
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn,
    },
  );
}

/** Verify a token and return its claims, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<AuthClaims | null> {
  try {
    const { publicKey } = getKeys();
    const payload = await V4.verify(token, publicKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    /* paseto returns the payload as `unknown` — narrow it safely */
    if (typeof payload !== 'object') return null;
    const p = payload;
    if (
      typeof p.sub !== 'string' ||
      typeof p.email !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tenantId !== 'string'
    )
      return null;
    return {
      sub: p.sub,
      email: p.email,
      name: p.name,
      tenantId: p.tenantId,
      iat: typeof p.iat === 'string' ? p.iat : undefined,
      exp: typeof p.exp === 'string' ? p.exp : undefined,
    };
  } catch {
    return null;
  }
}
