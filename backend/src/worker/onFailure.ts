import type { Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/**
 * Atualiza a Violation pra status FAILED quando os retries do BullMQ esgotaram.
 *
 * BullMQ emite 'failed' a cada tentativa malsucedida — esse handler só
 * escreve no DB no FALHA FINAL, evitando que erros transientes (que ainda
 * vão dar retry) virem registros FAILED prematuramente.
 *
 * É best-effort: se o DB estiver indisponível, log + segue. A fila já
 * tem a verdade do estado pra reconciliação posterior.
 */
export async function handleFinalFailure(job: Job, err: Error): Promise<void> {
  const maxAttempts = job.opts.attempts ?? 1;
  const isFinalAttempt = job.attemptsMade >= maxAttempts;
  if (!isFinalAttempt) return;
  if (typeof job.id !== 'string' || job.id.length === 0) return;

  try {
    await prisma.violation.updateMany({
      where: { jobId: job.id },
      data: {
        status: 'FAILED',
        attempts: job.attemptsMade,
        errorMessage: err.message,
        finishedAt: new Date(),
      },
    });
  } catch (dbErr) {
    logger.error(
      { err: (dbErr as Error).message, jobId: job.id },
      'violation:write-final-failure-failed',
    );
  }
}
