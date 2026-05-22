# FURY · Backend (Tech Challenge)

Mini-API em **Node.js + TypeScript** que recebe webhooks de violação de anúncio,
enfileira jobs de takedown via **BullMQ + Redis**, e o worker dispara chamadas
HTTP externas com **retry exponencial** e **idempotência** por `tenantId + adId`.

> Este README cobre **apenas o escopo do desafio** — webhook → fila → worker → status.
> O monorepo na raiz tem componentes adicionais (frontend, auth, dashboard) que ficam
> fora do escopo de avaliação. Veja [../README.md](../README.md) pra contexto completo.

---

## ✅ Cobertura dos requisitos

| Requisito do desafio | Onde está | Status |
|---|---|---|
| Mini-API Node.js + TypeScript estrito (sem `any` espalhado) | [tsconfig.json](tsconfig.json) com `strict + noUncheckedIndexedAccess` + ESLint `strictTypeChecked` | ✅ |
| `POST /webhook/violation` recebendo o payload exato do desafio | [src/routes/webhook.ts](src/routes/webhook.ts) | ✅ |
| Validação com Zod retornando **400 + erros detalhados** | [src/schemas/violation.ts](src/schemas/violation.ts) (`strict()`, ISO 8601, enums com mensagens PT-BR) | ✅ |
| Enfileirar job de `takedown` via **BullMQ + Redis** | [src/queue/violationQueue.ts](src/queue/violationQueue.ts) + [factory.ts](src/queue/factory.ts) | ✅ |
| Worker chama **JSONPlaceholder** tratando 2xx, 4xx, 5xx, timeout | [src/worker/upstream.ts](src/worker/upstream.ts) + [processor.ts](src/worker/processor.ts) | ✅ |
| Retry automático com **backoff exponencial · máx 3 tentativas** | [src/queue/jobOptions.ts](src/queue/jobOptions.ts) (`attempts: 3, backoff: { type: 'exponential', delay: 1000 }` → 1s/2s/4s) | ✅ |
| **Idempotência**: `tenantId + adId` não gera 2 jobs simultâneos | `buildJobId` + dedup check em [webhook.ts](src/routes/webhook.ts) | ✅ |
| `GET /jobs/:id` retornando `{ jobId, status, attempts, result, error }` | [src/routes/jobs.ts](src/routes/jobs.ts) + [_jobState.ts](src/routes/_jobState.ts) | ✅ |
| README com instruções claras | este arquivo | ✅ |

---

## 🚀 Setup em 60 segundos

```bash
# Do diretório raiz do monorepo:
npm run install:all
npm run redis:up          # ou setar REDIS_URL pra Upstash em backend/.env
npm run dev               # backend + frontend

# Backend isolado:
cd backend && npm run dev # http://localhost:3001
```

---

## 🔌 API

### `POST /webhook/violation`

```json
{
  "adId":          "ad_8f3k29",
  "tenantId":      "tenant_acme",
  "violationType": "PROHIBITED_TERM",
  "severity":      "CRITICAL",
  "detectedAt":    "2026-05-21T14:23:01Z"
}
```

| Campo | Tipo | Regra |
|---|---|---|
| `adId` | string não-vazia | obrigatório |
| `tenantId` | string não-vazia | obrigatório |
| `violationType` | enum | `PROHIBITED_TERM` · `BRAND_VIOLATION` · `COMPLIANCE_FAIL` |
| `severity` | enum | `LOW` · `MEDIUM` · `HIGH` · `CRITICAL` |
| `detectedAt` | string | ISO 8601 |

**Respostas:**

- `202 Accepted` → `{ jobId, status: "queued", severity }`
- `200 OK` (dedup) → `{ jobId, status, deduplicated: true, message }`
- `400 Bad Request` → `{ error, details: { fieldErrors, formErrors } }`

### `GET /jobs/:id`

```json
{
  "jobId":   "tenant_acme__ad_8f3k29",
  "status":  "completed",
  "attempts": 1,
  "result": {
    "upstreamStatus":    200,
    "upstreamLatencyMs": 134,
    "attemptedAt":       "2026-05-21T14:23:01.412Z",
    "adId":              "ad_8f3k29",
    "tenantId":          "tenant_acme"
  },
  "error": null
}
```

- `status` ∈ `waiting` · `active` · `delayed` · `completed` · `failed` · `waiting-children`
- `404` se job não existir

### Auxiliares

| Método | Path | O que faz |
|---|---|---|
| `GET` | `/health` | `{ ok: true, queue: "..." }` |
| `GET` | `/metrics` | Prometheus exposition format — contadores por estado + uptime |

---

## 🔄 Fluxo

```
   ┌──────────────────────┐
   │  Meta Ads (simulado) │
   └──────────┬───────────┘
              ▼
   POST /webhook/violation             ← Express + Zod (400 se inválido)
              │
              ▼
   buildJobId = `${tenantId}:${adId}`
              │
              ▼  [idempotency check]
   ┌── Já existe em waiting/active/delayed?
   │              │
   │              ▼  YES → 200 { deduplicated: true }
   │              ▼
   │     NO → queue.add('takedown', payload, jobOptionsFor(severity))
   │
   ▼
   BullMQ + Redis (queue: ad-processing)
              ▼
   ┌─────────────────────────┐
   │ Worker (concurrency=5)  │
   │  callUpstream(...)      │  ← AbortController timeout 5s
   │  ├─ 2xx  → success      │
   │  ├─ 4xx  → throw retry  │
   │  ├─ 5xx  → throw retry  │
   │  └─ to   → throw retry  │
   │  attempts: 3 (LOW/MED)  │  ← backoff: 1s, 2s, 4s
   │           4 (HIGH)      │
   │           5 (CRITICAL)  │
   └────────────┬────────────┘
                ▼
       GET /jobs/:id  →  { jobId, status, attempts, result, error }
```

---

## 🧪 Smoke test (curl)

```bash
# 1. Enfileira
curl -X POST http://localhost:3001/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{"adId":"ad_001","tenantId":"acme","violationType":"PROHIBITED_TERM","severity":"CRITICAL","detectedAt":"2026-05-21T14:23:01Z"}'
# → 202 { "jobId":"acme:ad_001", "status":"queued", "severity":"CRITICAL" }

# 2. Status
curl http://localhost:3001/jobs/acme:ad_001
# → 200 { "jobId":"...", "status":"completed", "attempts":1, "result":{...}, "error":null }

# 3. Idempotência (chame o POST de novo enquanto está active)
curl -X POST http://localhost:3001/webhook/violation -H "Content-Type: application/json" \
  -d '{"adId":"ad_001","tenantId":"acme","violationType":"PROHIBITED_TERM","severity":"CRITICAL","detectedAt":"2026-05-21T14:23:01Z"}'
# → 200 { "deduplicated": true, ... }

# 4. Payload inválido
curl -X POST http://localhost:3001/webhook/violation -H "Content-Type: application/json" \
  -d '{"adId":"a","tenantId":"t","violationType":"PROHIBITED_TERM","severity":"SEVERE","detectedAt":"2026-05-21T14:23:01Z"}'
# → 400 { "error":"Payload inválido", "details":{ "fieldErrors":{ "severity":[...] } } }

# 5. Métricas Prometheus
curl http://localhost:3001/metrics
# → text/plain com fury_jobs_total{state="..."}
```

---

## 🧪 Testes

```bash
npm test               # 47 testes (~5s) + 6 E2E (skipped sem Docker)
npm run test:watch     # modo watch
npm run test:coverage  # com thresholds (lines >= 90%)
```

**53 testes em 8 arquivos:**

| Arquivo | Cobre |
|---|---|
| `schemas/violation.test.ts` (7) | schema valid/invalid, ISO 8601, strict, enums combinados |
| `queue/violationQueue.test.ts` (7) | `buildJobId` determinismo + `jobOptionsFor` severity routing |
| `routes/_jobState.test.ts` (3) | `IN_FLIGHT_STATES` + `isInFlight` |
| `routes/webhook.test.ts` (8) | POST integration (202 / 400 / 200 dedup / strict) |
| `routes/jobs.test.ts` (4) | GET shape exato para waiting/completed/failed/404 |
| `routes/metrics.test.ts` (4) | `/metrics` Prom format + uptime + counters |
| `worker/upstream.test.ts` (5) | 2xx / 4xx / 5xx / timeout / network |
| `worker/processor.test.ts` (4) | TakedownResult shape + propagação UpstreamError |
| `e2e.test.ts` (6) | **E2E real com Redis (testcontainers)** + worker live: happy path, retry (2 fail + 1 ok), final fail (3 attempts), idempotência concorrente, idempotência sequencial, 404 |

**Coverage do núcleo:**

| Métrica | Valor | Threshold |
|---|---|---|
| Lines | **97%** | 90% |
| Functions | **100%** | 95% |
| Statements | **97%** | 90% |
| Branches | **92%** | 80% |

---

## 🛡️ XP gate (1 comando)

```bash
npm run check     # lint + typecheck + format:check + test
```

Quebra detalhada:

```bash
npm run lint            # ESLint 9 + typescript-eslint strict-type-checked
npm run typecheck       # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run format:check    # Prettier (--check)
npm test                # Vitest (47 + 6 e2e)
npm run test:coverage   # com thresholds
npm run audit           # npm audit --audit-level=moderate
```

CI completo em [.github/workflows/ci.yml](../.github/workflows/ci.yml) com Redis service container — E2E real roda no CI.

---

## 🏗️ Arquitetura

```
src/
├── schemas/violation.ts          ← Zod (strict, ISO 8601, enums com mensagens PT-BR)
├── queue/
│   ├── jobOptions.ts             ← PURO: DEFAULT_JOB_OPTIONS, jobOptionsFor, buildJobId
│   ├── factory.ts                ← createViolationQueue(name, connection) — injetável
│   └── violationQueue.ts         ← singleton em prod (importa connection + factory)
├── routes/
│   ├── _jobState.ts              ← IN_FLIGHT_STATES, isInFlight, jobStatus helper
│   ├── webhook.ts                ← POST /webhook/violation
│   ├── jobs.ts                   ← GET /jobs/:id
│   └── metrics.ts                ← GET /metrics (Prometheus text)
├── worker/
│   ├── upstream.ts               ← callUpstream + UpstreamError + isAbortError (fetch injetável)
│   ├── processor.ts              ← processTakedown (lógica pura, mockable)
│   └── createWorker.ts           ← createTakedownWorker(name, connection) — injetável
├── lib/
│   └── logger.ts                 ← pino estruturado (JSON em prod, pretty em dev)
├── config/{env,redis}.ts
├── worker.ts                     ← bootstrap (importa singletons + chama factory)
└── index.ts                      ← Express app + listen
```

Pontos-chave da disciplina XP:

1. **Pure functions separadas do I/O** — `buildJobId`, `jobOptionsFor`, `isInFlight`, `isAbortError` testáveis sem Redis.
2. **DI leve** — `callUpstream(url, timeout, fetchImpl)`, `createViolationQueue(name, connection)`, `createTakedownWorker(name, connection)` permitem testar com Redis real (testcontainers) ou mock conforme necessário.
3. **TDD em cada feature** — `/metrics` foi escrito teste-primeiro; bug do `AbortError` no Node 18+ undici foi caught pelo teste.
4. **Sem `any` espalhado** — `strict + noUncheckedIndexedAccess` no TS; `strictTypeChecked` no ESLint; `unknown` em catch handlers.

---

## ⚙️ Env vars ([.env](.env))

```bash
PORT=3001
QUEUE_NAME=ad-processing
WORKER_CONCURRENCY=5

# Redis local (Docker)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# OU Upstash (free tier)
# REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:6379
```

Validadas via Zod em [config/env.ts](src/config/env.ts) — boot falha cedo se envs inválidas.

---

## 🎚 Severity-based routing (extra)

O desafio pede `attempts: 3 + backoff exponencial` — está cumprido. O enum de severity foi aproveitado pra escalar:

| Severity | Priority (menor = primeiro) | Attempts |
|---|---|---|
| `CRITICAL` | 1 | **5** |
| `HIGH` | 2 | 4 |
| `MEDIUM` | 3 | 3 *(default do desafio)* |
| `LOW` | 4 | 3 *(default do desafio)* |

Backoff `1s/2s/4s` (exponencial, delay 1000ms) aplicado a todos. Pure function em [jobOptions.ts](src/queue/jobOptions.ts) com 7 testes.

---

## 📜 Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor com `tsx watch` |
| `npm run build` | Compila pra `dist/` |
| `npm test` | 47 testes + 6 E2E (skip se sem Docker) |
| `npm run test:coverage` | Coverage com thresholds |
| `npm run lint` | ESLint 9 strict-type-checked |
| `npm run lint:fix` | Auto-fix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run audit` | `npm audit --audit-level=moderate` |
| `npm run check` | **XP gate único: lint + typecheck + format + test** |
