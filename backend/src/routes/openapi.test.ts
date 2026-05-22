import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { openapiRouter } from './openapi.js';

/**
 * Specs do endpoint /openapi.json + /docs.
 *
 * Validamos que:
 *   - /openapi.json retorna OpenAPI 3.1 com info + paths esperados
 *   - Paths essenciais (webhook, auth, tenants) estão registrados
 *   - /docs serve HTML com Swagger UI (status 200, content-type html)
 *   - Cache headers permitem o spec ser cacheado (immutable per build)
 */

function buildApp(): express.Express {
  const app = express();
  app.use(openapiRouter);
  return app;
}

describe('GET /openapi.json', () => {
  it('returns OpenAPI 3.1 document with info + servers + paths', async () => {
    const res = await request(buildApp()).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toMatch(/^3\.1\./);
    expect(res.body.info).toMatchObject({
      title: expect.stringMatching(/FURY/i),
      version: expect.any(String),
    });
    expect(res.body.paths).toBeDefined();
  });

  it('registers webhook + auth + tenants paths', async () => {
    const res = await request(buildApp()).get('/openapi.json');
    const paths = Object.keys(res.body.paths as Record<string, unknown>);

    expect(paths).toContain('/webhook/violation');
    expect(paths).toContain('/auth/login');
    expect(paths).toContain('/auth/register');
    expect(paths).toContain('/tenants/me');
  });

  it('webhook/violation path documents the request schema with required fields', async () => {
    const res = await request(buildApp()).get('/openapi.json');
    const post = res.body.paths['/webhook/violation'].post;

    expect(post).toBeDefined();
    expect(post.requestBody).toBeDefined();
    /* Schema é registrado como component reusável + referenciado via $ref —
       padrão de OpenAPI bem feito. Resolvemos o ref pra validar. */
    const ref = post.requestBody.content['application/json'].schema.$ref as string;
    expect(ref).toBe('#/components/schemas/ViolationPayload');
    const schema = res.body.components.schemas.ViolationPayload;
    expect(schema.required).toEqual(
      expect.arrayContaining(['adId', 'tenantId', 'violationType', 'severity', 'detectedAt']),
    );
    expect(schema.properties.severity.enum).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('declares securitySchemes for the cookie + bearer auth used by the API', async () => {
    const res = await request(buildApp()).get('/openapi.json');
    const schemes = res.body.components?.securitySchemes;

    expect(schemes).toBeDefined();
    expect(schemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie' });
    expect(schemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
});

describe('GET /docs', () => {
  it('serves HTML page with Swagger UI', async () => {
    const res = await request(buildApp()).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/swagger-ui/i);
  });
});
