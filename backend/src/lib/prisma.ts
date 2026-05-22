import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * PrismaClient singleton.
 *
 * Em dev com tsx watch, cada reload do código criaria uma nova instância,
 * estourando o pool de conexões do Neon depois de algumas reloads. O cache
 * em `globalThis` sobrevive ao hot-reload.
 *
 * Em prod (Render), cada processo cria uma instância — comportamento normal.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
