import type { Job } from 'bullmq';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakedownResult, ViolationPayload } from '../schemas/violation.js';
import { UpstreamError } from './upstream.js';

vi.mock('./upstream.js', async () => {
  const real = await vi.importActual<typeof import('./upstream.js')>('./upstream.js');
  return {
    ...real,
    callUpstream: vi.fn(),
  };
});

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

type CallUpstreamFn = typeof import('./upstream.js').callUpstream;
type ProcessFn = typeof import('./processor.js').processTakedown;

let callUpstreamMock: ReturnType<typeof vi.fn>;
let processTakedown: ProcessFn;

beforeAll(async () => {
  const upstream = (await import('./upstream.js')) as unknown as { callUpstream: CallUpstreamFn };
  callUpstreamMock = upstream.callUpstream as unknown as ReturnType<typeof vi.fn>;
  ({ processTakedown } = await import('./processor.js'));
});

beforeEach(() => {
  violationUpdateManySpy.mockClear();
});

function makeJob(overrides?: Partial<ViolationPayload>): Job<ViolationPayload, TakedownResult> {
  const data: ViolationPayload = {
    adId: 'ad_1',
    tenantId: 'tenant_x',
    violationType: 'PROHIBITED_TERM',
    severity: 'HIGH',
    detectedAt: '2026-05-21T14:23:01Z',
    ...overrides,
  };
  return {
    id: 'tenant_x__ad_1',
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Job<ViolationPayload, TakedownResult>;
}

describe('processTakedown', () => {
  it('retorna TakedownResult com status 2xx em sucesso', async () => {
    callUpstreamMock.mockResolvedValueOnce({ status: 200 });
    const result = await processTakedown(makeJob());
    expect(result).toMatchObject({
      upstreamStatus: 200,
      adId: 'ad_1',
      tenantId: 'tenant_x',
    });
    expect(result.upstreamLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.attemptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('propaga UpstreamError quando upstream falha (4xx)', async () => {
    callUpstreamMock.mockRejectedValueOnce(new UpstreamError('upstream HTTP 404', 404));
    await expect(processTakedown(makeJob())).rejects.toMatchObject({
      name: 'UpstreamError',
      status: 404,
    });
  });

  it('propaga UpstreamError quando upstream falha (5xx)', async () => {
    callUpstreamMock.mockRejectedValueOnce(new UpstreamError('upstream HTTP 503', 503));
    await expect(processTakedown(makeJob())).rejects.toMatchObject({
      name: 'UpstreamError',
      status: 503,
    });
  });

  it('propaga UpstreamError em timeout (sem status)', async () => {
    callUpstreamMock.mockRejectedValueOnce(new UpstreamError('upstream timeout after 5000ms'));
    const err = await processTakedown(makeJob()).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.message).toMatch(/timeout/);
    expect(err.status).toBeUndefined();
  });

  /* ── Novos comportamentos da Fase 1.4: writes no Violation ── */

  it('marca Violation como ACTIVE no início do processamento (com attempts++)', async () => {
    callUpstreamMock.mockResolvedValueOnce({ status: 200 });
    await processTakedown(makeJob());
    const activeCall = violationUpdateManySpy.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'ACTIVE',
    );
    expect(activeCall).toBeDefined();
    const args = activeCall?.[0] as {
      where: { jobId: string };
      data: { status: string; attempts: number };
    };
    expect(args.where.jobId).toBe('tenant_x__ad_1');
    expect(args.data.attempts).toBe(1); /* attemptsMade=0 + 1 */
  });

  it('marca Violation como COMPLETED com upstream details em sucesso', async () => {
    callUpstreamMock.mockResolvedValueOnce({ status: 200 });
    await processTakedown(makeJob());
    const completedCall = violationUpdateManySpy.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'COMPLETED',
    );
    expect(completedCall).toBeDefined();
    const args = completedCall?.[0] as {
      where: { jobId: string };
      data: {
        status: string;
        upstreamStatus: number;
        upstreamLatencyMs: number;
        finishedAt: Date;
      };
    };
    expect(args.where.jobId).toBe('tenant_x__ad_1');
    expect(args.data.upstreamStatus).toBe(200);
    expect(args.data.upstreamLatencyMs).toBeGreaterThanOrEqual(0);
    expect(args.data.finishedAt).toBeInstanceOf(Date);
  });

  it('NÃO marca Violation como FAILED em falha individual (BullMQ vai retry)', async () => {
    callUpstreamMock.mockRejectedValueOnce(new UpstreamError('upstream HTTP 503', 503));
    await processTakedown(makeJob()).catch(() => undefined);
    const failedCall = violationUpdateManySpy.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'FAILED',
    );
    expect(failedCall).toBeUndefined(); /* só onFailure.ts marca FAILED */
  });

  it('não quebra processamento se update do DB falhar (log + segue)', async () => {
    callUpstreamMock.mockResolvedValueOnce({ status: 200 });
    violationUpdateManySpy.mockRejectedValueOnce(new Error('DB offline'));
    /* Não deve lançar — DB write é best-effort, o job em si terminou bem */
    await expect(processTakedown(makeJob())).resolves.toMatchObject({ upstreamStatus: 200 });
  });
});
