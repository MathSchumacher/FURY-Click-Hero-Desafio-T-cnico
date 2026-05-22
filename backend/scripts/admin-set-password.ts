/**
 * Admin one-off: define uma nova senha pra um user direto via Prisma.
 *
 * Uso:
 *   cd backend && npx tsx scripts/admin-set-password.ts <email> <newPassword>
 *
 * Usa bcrypt cost 12, mesmo do /auth/register. Pra emergência apenas
 * (acesso ao DB = pode tudo); fluxo normal é /auth/forgot-password.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Uso: tsx scripts/admin-set-password.ts <email> <newPassword>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('Senha precisa ter no mínimo 8 caracteres.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User com email '${email}' não encontrado.`);
    process.exit(2);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, emailVerified: true },
  });

  console.log('');
  console.log('✅ Senha atualizada.');
  console.log(`   Email:   ${email}`);
  console.log(`   UserId:  ${user.id}`);
  console.log(`   Verified: true (marcado automaticamente já que admin definiu)`);
  console.log('');
  console.log('Agora dá pra logar com a senha nova.');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(99);
});
