import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeJob = {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  attemptsMade: number;
  returnvalue: unknown;
  failedReason?: string;
  getState: () => Promise<string>;
};

const fakeJobs: Map<string, FakeJob> = new Map();

vi.mock('../queue/violationQueue.js', () => ({
  violationQueue: {
    getJob: async (id: string): Promise<FakeJob | undefined> => fakeJobs.get(id),
  },
  QUEUE_NAME: 'test-queue',
}));

beforeEach(() => fakeJobs.clear());

async function buildApp(): Promise<express.Express> {
  const { jobsRouter } = await import('./jobs.js');
  const app = express();
  app.use(jobsRouter);
  return app;
}

function makeFakeJob(partial: Partial<FakeJob> & { id: string; state: FakeJob['state'] }): FakeJob {
  return {
    attemptsMade: 0,
    returnvalue: null,
    getState: async () => partial.state,
    ...partial,
  };
}

describe('GET /jobs/:id', () => {
  it('404 quando job não existe', async () => {
    const app = await buildApp();
    const res = await request(app).get('/jobs/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('retorna shape exato { jobId, status, attempts, result, error } pra job completed', async () => {
    fakeJobs.set(
      't:a',
      makeFakeJob({
        id: 't:a',
        state: 'completed',
        attemptsMade: 1,
        returnvalue: { upstreamStatus: 200, adId: 'a', tenantId: 't' },
      }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/t:a');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jobId: 't:a',
      status: 'completed',
      attempts: 1,
      result: { upstreamStatus: 200, adId: 'a', tenantId: 't' },
      error: null,
    });
  });

  it('retorna error preenchido + result null pra job failed', async () => {
    fakeJobs.set(
      't:a',
      makeFakeJob({
        id: 't:a',
        state: 'failed',
        attemptsMade: 3,
        returnvalue: null,
        failedReason: 'upstream HTTP 500',
      }),
    );
    const app = await buildApp();
    const res = await request(app).get('/jobs/t:a');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jobId: 't:a',
      status: 'failed',
      attempts: 3,
      result: null,
      error: 'upstream HTTP 500',
    });
  });

  it('retorna attempts=0 e result=null pra job waiting', async () => {
    fakeJobs.set('t:a', makeFakeJob({ id: 't:a', state: 'waiting' }));
    const app = await buildApp();
    const res = await request(app).get('/jobs/t:a');
    expect(res.body).toMatchObject({
      jobId: 't:a',
      status: 'waiting',
      attempts: 0,
      result: null,
      error: null,
    });
  });
});
