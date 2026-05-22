/**
 * Admin one-off: gera token de password reset pro email passado e imprime
 * o link pronto (pra deploy onde o email sender ainda não tá conectado).
 *
 * Uso:
 *   cd backend && npx tsx scripts/admin-reset-password.ts <email>
 *
 * O token é gravado no DB via issueVerificationToken (mesmo fluxo do
 * /auth/forgot-password). Single-use, TTL 1h, hash SHA-256.
 */

import { issueVerificationToken } from '../src/auth/verification.js';
import { prisma } from '../src/lib/prisma.js';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: tsx scripts/admin-reset-password.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User com email '${email}' não encontrado no DB.`);
    process.exit(2);
  }

  const issued = await issueVerificationToken(user.id, 'PASSWORD_RESET');
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const link = `${frontend}/auth/reset-password?token=${encodeURIComponent(issued.raw)}`;

  console.log('');
  console.log('✅ Token de password reset gerado.');
  console.log(`   Email:      ${email}`);
  console.log(`   UserId:     ${user.id}`);
  console.log(`   Expira em:  ${issued.expiresAt.toISOString()}`);
  console.log('');
  console.log('Abra este link no browser pra definir nova senha:');
  console.log(link);
  console.log('');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(99);
});
