import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { violationPayloadSchema, VIOLATION_TYPES, SEVERITIES } from '../schemas/violation.js';

/**
 * OpenAPI 3.1 spec gerado a partir dos schemas zod existentes + metadados
 * de rota. Decisão consciente: registramos apenas o contrato PÚBLICO (o que
 * um integrador externo precisa pra usar a plataforma). Rotas internas
 * (admin, dead-letter, metrics) ficam fora — diminui surface + simplifica
 * docs.
 *
 * Augmentação do zod com `.openapi()` precisa ser feita uma única vez no
 * módulo — depois disso, todos os schemas podem chamar o método.
 */

extendZodWithOpenApi(z);

export function buildOpenApiSpec(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();

  /* ── Security schemes ──────────────────────────────────────── */
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'fury_session',
    description: 'PASETO V4.public token em cookie HttpOnly. Definido após login bem-sucedido.',
  });
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'PASETO',
    description: 'Authorization: Bearer <token>. Alternativa pra CLIs/API clients.',
  });

  /* ── Schemas reusáveis (zod → JSON Schema) ──────────────────── */

  const violationPayload = registry.register(
    'ViolationPayload',
    violationPayloadSchema.openapi({
      description: 'Payload de violação recebido via webhook.',
      example: {
        adId: 'ad_meta_8821',
        tenantId: 'tnt_acme',
        violationType: 'PROHIBITED_TERM',
        severity: 'HIGH',
        detectedAt: '2026-05-22T14:23:01Z',
      },
    }),
  );

  const errorResponse = registry.register(
    'Error',
    z
      .object({
        error: z.string().openapi({ example: 'mensagem de erro' }),
        requestId: z.string().uuid().optional().openapi({ example: '1f0c…uuid' }),
        field: z.string().optional().openapi({
          description: 'Campo que falhou validação. Presente em 400s.',
          example: 'adId',
        }),
      })
      .openapi({ description: 'Resposta padronizada de erro.' }),
  );

  const loginRequest = registry.register(
    'LoginRequest',
    z
      .object({
        email: z.string().email().openapi({ example: 'user@empresa.com' }),
        password: z.string().min(8).max(120),
      })
      .strict(),
  );

  const registerRequest = registry.register(
    'RegisterRequest',
    z
      .object({
        name: z.string().min(2).max(80),
        email: z.string().email(),
        password: z.string().min(8).max(120),
      })
      .strict(),
  );

  const tenantInfo = registry.register(
    'TenantInfo',
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      createdAt: z.string().datetime(),
      role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
    }),
  );

  const sessionResponse = registry.register(
    'SessionResponse',
    z.object({
      token: z.string().openapi({ description: 'PASETO token (também setado em cookie).' }),
      user: z.object({
        id: z.string(),
        email: z.string().email(),
        name: z.string(),
      }),
      tenant: z.object({ id: z.string(), name: z.string().optional(), slug: z.string().optional() }),
    }),
  );

  /* ── Paths ──────────────────────────────────────────────────── */

  registry.registerPath({
    method: 'post',
    path: '/webhook/violation',
    summary: 'Recebe um evento de violação de anúncio',
    description:
      'Endpoint público (com HMAC opcional via `X-FURY-Signature`). Enfileira ' +
      'um job de takedown em BullMQ. Dedup automático por (tenantId, adId).',
    tags: ['Webhook'],
    request: {
      headers: z.object({
        'x-fury-signature': z
          .string()
          .optional()
          .openapi({
            description:
              'HMAC-SHA256 do body assinado com o webhook secret do tenant. ' +
              'Formato `sha256=<hex>`. Obrigatório se `WEBHOOK_REQUIRE_SIGNATURE=true`.',
            example: 'sha256=8d2f…',
          }),
      }),
      body: {
        content: { 'application/json': { schema: violationPayload } },
      },
    },
    responses: {
      202: {
        description: 'Job enfileirado com sucesso.',
        content: {
          'application/json': {
            schema: z.object({
              jobId: z.string(),
              status: z.literal('queued'),
              severity: z.enum(SEVERITIES),
              deduplicated: z.boolean().optional(),
            }),
          },
        },
      },
      200: {
        description: 'Violation já existia (deduplicated).',
        content: { 'application/json': { schema: errorResponse } },
      },
      400: { description: 'Payload inválido.', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'Signature inválida.', content: { 'application/json': { schema: errorResponse } } },
      429: { description: 'Rate limit excedido.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Auth'],
    summary: 'Login com email + senha',
    request: { body: { content: { 'application/json': { schema: loginRequest } } } },
    responses: {
      200: { description: 'Login OK.', content: { 'application/json': { schema: sessionResponse } } },
      401: { description: 'Credenciais inválidas.', content: { 'application/json': { schema: errorResponse } } },
      429: { description: 'Rate limit.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['Auth'],
    summary: 'Cria conta + workspace (tenant) auto-provisionado',
    request: { body: { content: { 'application/json': { schema: registerRequest } } } },
    responses: {
      201: { description: 'Criada.', content: { 'application/json': { schema: sessionResponse } } },
      400: { description: 'Validação.', content: { 'application/json': { schema: errorResponse } } },
      409: { description: 'Email já registrado.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags: ['Auth'],
    summary: 'Retorna claims da sessão atual',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: {
        description: 'Sessão válida.',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              tenantId: z.string(),
            }),
          },
        },
      },
      401: { description: 'Token ausente/inválido.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/tenants/me',
    tags: ['Tenants'],
    summary: 'Workspace do usuário autenticado',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: { description: 'Info do tenant.', content: { 'application/json': { schema: tenantInfo } } },
      401: { description: 'Não autenticado.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/tenants/me/webhook-secret',
    tags: ['Tenants'],
    summary: 'Webhook secret do workspace (OWNER-only)',
    description:
      'Retorna o secret usado pra assinar webhooks. Auto-gera se ainda for null ' +
      '(rows legados pre-Sprint-1). Apenas OWNER pode visualizar.',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: {
        description: 'Secret atual.',
        content: {
          'application/json': {
            schema: z.object({
              secret: z.string().openapi({ example: 'whk_xZ8mLp…' }),
              instructions: z.string(),
            }),
          },
        },
      },
      403: { description: 'Role insuficiente.', content: { 'application/json': { schema: errorResponse } } },
      401: { description: 'Não autenticado.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/tenants/me/webhook-secret/rotate',
    tags: ['Tenants'],
    summary: 'Rotaciona webhook secret (invalida o anterior)',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: {
        description: 'Novo secret gerado.',
        content: { 'application/json': { schema: z.object({ secret: z.string() }) } },
      },
      403: { description: 'Role insuficiente ou CSRF ausente.', content: { 'application/json': { schema: errorResponse } } },
      401: { description: 'Não autenticado.', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Ops'],
    summary: 'Liveness/readiness probe (Redis + queue)',
    responses: {
      200: { description: 'Tudo up.' },
      503: { description: 'Redis ou queue down.' },
    },
  });

  /* ── Geração final ──────────────────────────────────────────── */

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'FURY API',
      version: '1.0.0',
      description:
        'API pública da FURY — plataforma de detecção e takedown automatizado ' +
        'de violações em anúncios. Webhook + auth + dashboard endpoints.',
      contact: { url: 'https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'https://fury-project.netlify.app/api', description: 'Produção (via Netlify proxy)' },
      { url: 'http://localhost:3001', description: 'Desenvolvimento local' },
    ],
    tags: [
      { name: 'Webhook', description: 'Recepção de eventos de violação' },
      { name: 'Auth', description: 'Login, registro, sessão' },
      { name: 'Tenants', description: 'Workspaces (multi-tenant)' },
      { name: 'Ops', description: 'Health, métricas, monitoramento' },
    ],
  });
}
