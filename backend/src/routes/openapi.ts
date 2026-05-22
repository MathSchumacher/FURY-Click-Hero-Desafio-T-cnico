import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from '../openapi/spec.js';

export const openapiRouter: Router = Router();

/**
 * /openapi.json + /docs — documentação pública da API.
 *
 * Decisão: spec é gerado uma única vez no boot (immutable per process) e
 * cacheado em memória. Não muda runtime, então response pode setar
 * `Cache-Control: public, max-age=3600`. Em prod, atrás de CDN tudo isso
 * fica edge-cached.
 *
 * Swagger UI é servido via `swagger-ui-express` que monta os assets
 * estáticos em `/docs/*`. Compatível com OpenAPI 3.1.
 */

const spec = buildOpenApiSpec();

openapiRouter.get('/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(spec);
});

/* swagger-ui-express usa `serve` + `setup` em pipeline. O cast em
   `Record<string, unknown>` é necessário porque o tipo do generator é
   union com Record interno; runtime é o JSON object esperado. */
openapiRouter.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(spec as unknown as Record<string, unknown>, {
    customSiteTitle: 'FURY API · Docs',
    customCss: `
      .topbar { display: none; }
      body { background: #0a0a0c; }
      .swagger-ui .info .title { color: #ff3d2e; }
    `,
  }),
);
