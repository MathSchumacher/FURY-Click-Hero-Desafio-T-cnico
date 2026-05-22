# Roadmap · 9.0 → 10.0

Status atual: **~9.0**. Atende todos os requisitos do desafio + extras dentro do tema
(severity routing, structured logging, /metrics, E2E real com testcontainers).

Esse documento lista o que falta pra chegar perto de 10.0 — sem fugir do tema, sem
inflar escopo. Cada item tem **esforço estimado, ganho esperado e justificativa pela
disciplina XP**.

---

## Tier 1 — Alto ROI · pequeno esforço (1–2h cada)

### 1.1 · URL do upstream configurável via env
Hoje `UPSTREAM_URL` é constante em [worker/upstream.ts](src/worker/upstream.ts).
Trocar pra ler de `env.UPSTREAM_URL` com default `https://jsonplaceholder.typicode.com/posts/1`.

- **Esforço:** 30 min · 1 teste (env override)
- **Ganho:** +0.1 — configurabilidade básica de produção
- **Por que XP aceita:** mudança observável (env contract), com teste; menor diff

### 1.2 · Dead-letter inspection endpoint
`GET /jobs?state=failed` lista os últimos 50 jobs que esgotaram tentativas, com
`failedReason` e `data`. Permite triagem manual sem mexer no Redis.

- **Esforço:** ~1h · 3 testes integration
- **Ganho:** +0.2 — operability real
- **Por que XP aceita:** contrato HTTP novo, coberto por testes; usa `queue.getJobs(['failed'])` que já existe no BullMQ

### 1.3 · Pino correlation-id por requisição
`req.id` (uuid v4) propagado no log do `processTakedown` quando o job é criado
via webhook. Permite seguir o request HTTP → fila → worker → resposta no
agregador de logs.

- **Esforço:** ~1h · 1 teste de log shape
- **Ganho:** +0.2 — observability "production-grade"
- **Por que XP aceita:** mudança observável (log field), com teste

### 1.4 · Health check com profundidade
`GET /health` hoje só responde `{ ok: true }`. Estender pra `{ ok, redis: 'up'|'down', queue: { waiting, active, failed } }`. Útil pra Kubernetes liveness probe.

- **Esforço:** 45 min · 2 testes
- **Ganho:** +0.1
- **Por que XP aceita:** contrato HTTP que pode ser consumido por orchestrators

---

## Tier 2 — Mais peso, mais valor (2–4h cada)

### 2.1 · Rate limiting por `tenantId`
`express-rate-limit` com store em Redis (já temos a conexão). Limite ex: 100 req/min
por `tenantId`. Sem isso, um cliente faz DDoS na própria fila.

- **Esforço:** ~2h · 3 testes (limite atingido → 429, reset após janela, isolation entre tenants)
- **Ganho:** +0.2 — proteção realista de produção
- **Por que XP aceita:** "tratamento de falhas/abuso" é parte do espírito do desafio (resilience)

### 2.2 · OpenAPI spec auto-gerada do Zod
`zod-to-openapi` + `GET /openapi.json` + `/docs` via Swagger UI. Contrato formal
gerado automaticamente do schema — uma única source of truth.

- **Esforço:** ~2h · 2 testes (spec serializável, contém violationType enum)
- **Ganho:** +0.3 — contrato profissional + DX excelente
- **Por que XP aceita:** documentação como código; reduz drift entre código e docs

### 2.3 · Logger HTTP request/response middleware
`pino-http` registrando method, path, status, latency, requestId de **toda** requisição.
Combinado com 1.3 dá pipeline completo de observability.

- **Esforço:** 1h · 2 testes (log presente, contém latency)
- **Ganho:** +0.2

### 2.4 · Graceful shutdown testado
Hoje [worker.ts](src/worker.ts) tem `SIGTERM` handler que chama `worker.close()` mas não
está testado. Adicionar teste E2E: enfileira job longo, manda SIGTERM, verifica que job
completa antes do process.exit.

- **Esforço:** 2h · 2 testes (E2E)
- **Ganho:** +0.2 — comportamento crítico em deploy/scale-down

---

## Tier 3 — Vale a pena se sobrar tempo (4–8h cada)

### 3.1 · Métricas reais com `prom-client`
Trocar o `/metrics` artesanal por `prom-client`: histogramas de latência por
severity, counters incrementados nos event listeners do Worker (`failed`, `completed`).
Pronto pra scraping de Prometheus de verdade.

- **Esforço:** ~3h · 4 testes
- **Ganho:** +0.3

### 3.2 · ADRs (Architecture Decision Records)
3 a 5 ADRs explicando trade-offs: por que BullMQ (vs Kafka/RabbitMQ/SQS), por que
`tenantId:adId` como jobId, por que severity define attempts em vez de delay, por que
PASETO V4 no auth bonus, por que testcontainers no E2E.

- **Esforço:** ~3h · sem código
- **Ganho:** +0.2 — sinaliza maturidade arquitetural

### 3.3 · Deploy demo (Railway ou Render)
Endpoint público acessível. Backend em Railway (Redis incluso no free tier) ou
Render. CI deploya automaticamente em push pra `main`. Smoke test pós-deploy.

- **Esforço:** ~4h · pipeline
- **Ganho:** +0.4 — "funciona de verdade, não é só código"

### 3.4 · Worker em processo separado
Hoje `src/index.ts` faz `import './worker.js'` — worker compartilha o processo do HTTP.
Em produção real, worker roda em containers separados pra escalar horizontalmente sem
duplicar HTTP. Mover `worker.ts` pra entrypoint próprio + docker-compose com 2 services.

- **Esforço:** ~3h · 1 teste E2E
- **Ganho:** +0.2 — arquitetura "12-factor" real

---

## ❌ O que NÃO entra nesse roadmap (sairia do tema)

- Trocar BullMQ por Kafka/RabbitMQ — desafio cita BullMQ explicitamente
- Adicionar features de UI/frontend
- OAuth providers no auth (já é bonus, suficiente)
- Multi-tenancy avançado, billing, etc.
- Migrations / schema de DB persistente — desafio é mini-API stateless

---

## Sequência sugerida (caminho ótimo)

Se houver mais 8h disponíveis, ordem de implementação por ROI decrescente:

1. **1.3** Correlation ID (1h, +0.2)
2. **1.1** Upstream URL via env (30min, +0.1)
3. **2.2** OpenAPI spec (2h, +0.3)
4. **2.1** Rate limiting (2h, +0.2)
5. **1.2** Dead-letter inspection (1h, +0.2)
6. **2.3** HTTP request logging (1h, +0.2)
7. **3.2** ADRs (1-2h paralelo, +0.2)

Total: ~10h pra subir de 9.0 → 10.0 com itens dentro do tema, todos com testes,
todos respeitando disciplina XP (menor diff, teste primeiro, contrato preservado).

---

## Checklist de "pronto para 10" (referência)

- [ ] Coverage `worker.ts` + `index.ts` (E2E cobre indiretamente; CI exclui hoje)
- [ ] Rate limit por tenant + teste
- [ ] OpenAPI gerada automaticamente
- [ ] Correlation ID end-to-end no log
- [ ] Métricas via prom-client (histograma latency por severity)
- [ ] HTTP request log middleware
- [ ] Graceful shutdown testado E2E
- [ ] Worker em processo separado + docker-compose
- [ ] 3+ ADRs documentando trade-offs principais
- [ ] Deploy demo público com smoke test no CI
- [ ] CHANGELOG.md mantido por commit lógico
