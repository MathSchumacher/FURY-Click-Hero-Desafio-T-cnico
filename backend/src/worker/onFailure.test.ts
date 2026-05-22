import type { Job } from 'bullmq';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const violationUpdateManySpy = vi
  .fn<(args: unknown) => Promise<{ count: number }>>()
  .mockResolvedValue({ count: 1 });

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    violation: {
      updateMany: (args: unknown) => violationUpdateManySpy(args),
    },
  },
}));

type HandleFn = typeof import('./onFailure.js').handleFinalFailure;

let handleFinalFailure: HandleFn;

beforeAll(async () => {
  ({ handleFinalFailure } = await import('./onFailure.js'));
});

beforeEach(() => {
  violationUpdateManySpy.mockClear();
});

function makeJob(overrides: { id?: string; attemptsMade?: number; attempts?: number } = {}): Job {
  return {
    id: overrides.id ?? 'tenant_x__ad_1',
    attemptsMade: overrides.attemptsMade ?? 3,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job;
}

describe('handleFinalFailure', () => {
  it('marca Violation como FAILED quando attempts esgotaram', async () => {
    const job = makeJob({ attemptsMade: 3, attempts: 3 });
    await handleFinalFailure(job, new Error('upstream HTTP 503'));
    expect(violationUpdateManySpy).toHaveBeenCalledTimes(1);
    const args = violationUpdateManySpy.mock.calls[0]?.[0] as {
      where: { jobId: string };
      data: { status: string; errorMessage: string; attempts: number; finishedAt: Date };
    };
    expect(args.where.jobId).toBe('tenant_x__ad_1');
    expect(args.data.status).toBe('FAILED');
    expect(args.data.errorMessage).toBe('upstream HTTP 503');
    expect(args.data.attempts).toBe(3);
    expect(args.data.finishedAt).toBeInstanceOf(Date);
  });

  it('NÃO atualiza DB se ainda há retries disponíveis', async () => {
    const job = makeJob({ attemptsMade: 1, attempts: 3 });
    await handleFinalFailure(job, new Error('transient'));
    expect(violationUpdateManySpy).not.toHaveBeenCalled();
  });

  it('NÃO atualiza DB quando job não tem id (defensivo)', async () => {
    const job = { id: undefined, attemptsMade: 3, opts: { attempts: 3 } } as unknown as Job;
    await handleFinalFailure(job, new Error('boom'));
    expect(violationUpdateManySpy).not.toHaveBeenCalled();
  });

  it('engole erro de DB sem propagar (best-effort)', async () => {
    violationUpdateManySpy.mockRejectedValueOnce(new Error('DB offline'));
    const job = makeJob({ attemptsMade: 3, attempts: 3 });
    /* Não pode lançar — se o DB tá offline, o erro vai pro log, não pro BullMQ */
    await expect(handleFinalFailure(job, new Error('upstream'))).resolves.toBeUndefined();
  });
});
