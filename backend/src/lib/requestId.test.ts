import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requestId } from './requestId.js';

function buildApp(): express.Express {
  const app = express();
  app.use(requestId);
  app.get('/echo', (req, res) => {
    res.json({ id: req.id });
  });
  return app;
}

describe('requestId middleware', () => {
  it('gera UUID v4 quando X-Request-Id ausente', async () => {
    const res = await request(buildApp()).get('/echo');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.headers['x-request-id']).toBe(res.body.id);
  });

  it('usa X-Request-Id do cliente quando presente', async () => {
    const res = await request(buildApp()).get('/echo').set('X-Request-Id', 'trace-abc-123');
    expect(res.body.id).toBe('trace-abc-123');
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('ignora X-Request-Id vazio ou muito longo (>128 chars)', async () => {
    const empty = await request(buildApp()).get('/echo').set('X-Request-Id', '');
    expect(empty.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const tooLong = 'x'.repeat(200);
    const long = await request(buildApp()).get('/echo').set('X-Request-Id', tooLong);
    expect(long.body.id).not.toBe(tooLong);
    expect(long.body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
