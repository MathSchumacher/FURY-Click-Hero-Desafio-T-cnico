<div align="center">

<img src="docs/logo.webp" alt="FURY" width="320" />

# Tech Challenge

**Mini-API event-driven em Node.js + TypeScript: webhook → BullMQ → Worker → status.**

[![CI](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/actions/workflows/ci.yml/badge.svg)](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-57%20%2B%206%20E2E-success)](backend/src)
[![Coverage](https://img.shields.io/badge/coverage-97%25-success)](backend/vitest.config.ts)
[![Type](https://img.shields.io/badge/TypeScript-strict-blue)](backend/tsconfig.json)
[![Lint](https://img.shields.io/badge/ESLint-strict--type--checked-blueviolet)](backend/eslint.config.mjs)

<br />

<img src="docs/print1.png" alt="FURY — landing page completa do produto" width="820" />

<p><em>A landing page completa do FURY — construída em volta do core do desafio pra dar contexto de produto real (Vite + React + GSAP + R3F + Clash Display/Satoshi).</em></p>

</div>

---

## 👋 Para o avaliador — leia primeiro

**Onde está o core do desafio?** Tudo o que foi explicitamente pedido está em [`backend/`](backend/).
Tem também uma **landing page e dashboard pós-login** completos em [`frontend/`](frontend/) —
construídos em volta do desafio pra mostrar o produto FURY como ele seria de verdade.

```bash
# Setup completo em 60s
npm run install:all
npm run redis:up       # Docker · ou setar REDIS_URL pra Upstash em backend/.env
npm run dev            # backend :3001 + frontend :5173

# Núcleo do desafio isolado:
cd backend && npm run dev    # http://localhost:3001
```

### ⚡ Os 3 comandos que provam o desafio rodando

> **Pré-requisito:** Redis precisa estar rodando (`npm run redis:up` ou Upstash).

```bash
# 1️⃣  Enfileira um job de takedown
curl -X POST http://localhost:3001/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{
    "adId":          "ad_8f3k29",
    "tenantId":      "tenant_acme",
    "violationType": "PROHIBITED_TERM",
    "severity":      "CRITICAL",
    "detectedAt":    "2026-05-21T14:23:01Z"
  }'
# → 202 Accepted { "jobId": "tenant_acme:ad_8f3k29", "status": "queued", ... }
```

```bash
# 2️⃣  Consulta o status (depois de ~2 segundos)
curl http://localhost:3001/jobs/tenant_acme:ad_8f3k29
# → 200 { "jobId": "...", "status": "completed", "attempts": 1, "result": {...}, "error": null }
```

```bash
# 3️⃣  Idempotência: segundo POST com mesma chave enquanto está in-flight
curl -X POST http://localhost:3001/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{ ...mesmo payload... }'
# → 200 { "deduplicated": true, "message": "Já existe um job em andamento..." }
```

**Quer ver os testes provando que tudo funciona?**

```bash
cd backend
npm test                 # 57 testes unit/integration (~5s)
npm run test:coverage    # 97% coverage no núcleo do desafio
npm run check            # XP gate completo: lint + typecheck + format + test
```

### 🧪 Onde testar cada requisito (acesso rápido)

| Requisito do desafio | Arquivo · linha |
|---|---|
| `POST /webhook/violation` com payload exato | [backend/src/routes/webhook.ts](backend/src/routes/webhook.ts) · [test](backend/src/routes/webhook.test.ts) |
| Validação Zod **400 + detalhes** | [backend/src/schemas/violation.ts](backend/src/schemas/violation.ts) · [test](backend/src/schemas/violation.test.ts) |
| BullMQ + Redis · job `takedown` | [backend/src/queue/violationQueue.ts](backend/src/queue/violationQueue.ts) + [factory](backend/src/queue/factory.ts) |
| Worker → **JSONPlaceholder** (2xx/4xx/5xx/timeout) | [backend/src/worker/upstream.ts](backend/src/worker/upstream.ts) · [test](backend/src/worker/upstream.test.ts) |
| **Retry exponencial · máx 3 tentativas** | [backend/src/queue/jobOptions.ts](backend/src/queue/jobOptions.ts) · [test](backend/src/queue/violationQueue.test.ts) |
| **Idempotência** `tenantId+adId` | `buildJobId` em [jobOptions.ts](backend/src/queue/jobOptions.ts) + dedup check em [webhook.ts](backend/src/routes/webhook.ts) |
| `GET /jobs/:id` no shape pedido | [backend/src/routes/jobs.ts](backend/src/routes/jobs.ts) · [test](backend/src/routes/jobs.test.ts) |
| README com instruções | este arquivo + [backend/README.md](backend/README.md) |

---

## 🎯 Arquitetura do núcleo (event-driven)

```
        ┌──────────────────────┐
        │  Meta Ads (simulado) │
        └──────────┬───────────┘
                   ▼
        POST /webhook/violation          ← Express + Zod + correlation id
                   │  (400 se inválido)
                   ▼
        buildJobId = `${tenantId}:${adId}`
                   │
                   ▼  [idempotency check]
                   │  in-flight? → 200 { deduplicated: true }
                   ▼  ─────────── não? ──────────
        queue.add('takedown', payload, jobOptionsFor(severity))
                   │
                   ▼
   ╔═══════════════════════════════════╗
   ║   BullMQ Queue (Redis-backed)     ║
   ║   - persistence em Redis          ║
   ║   - jobId determinístico = dedup  ║
   ╚══════════════┬════════════════════╝
                  ▼
   ┌──────────────────────────────────┐
   │ Worker (concurrency configurável)│
   │                                  │
   │  callUpstream(JSONPlaceholder)   │  ← AbortController timeout 5s
   │  ├─ 2xx  → success               │
   │  ├─ 4xx  → throw → BullMQ retry  │
   │  ├─ 5xx  → throw → BullMQ retry  │
   │  └─ to   → throw → BullMQ retry  │
   │                                  │
   │  Backoff exponencial: 1s, 2s, 4s │
   │  Max attempts: 3 default         │
   │       (severity escala 3→5)      │
   └──────────────┬───────────────────┘
                  ▼
        GET /jobs/:id  →  { jobId, status, attempts, result, error }
```

---

## 📑 Endpoints

| Método | Path | Função | Cobertura de teste |
|---|---|---|---|
| `POST` | **`/webhook/violation`** | Recebe webhook + valida + enfileira | unit + integration + E2E real |
| `GET` | **`/jobs/:id`** | Status do job no shape do desafio | unit + integration + E2E real |
| `GET` | `/jobs/failed` | Dead-letter inspection (jobs que esgotaram retries) | unit + integration |
| `GET` | `/health` | Health check com Redis ping + queue counts + uptime | unit + integration |
| `GET` | `/metrics` | Prometheus exposition format | unit + integration |
| `POST` | `/auth/register` | *(bonus, fora do desafio)* | — |
| `POST` | `/auth/login` | *(bonus, fora do desafio)* | — |
| `GET` | `/auth/me` | *(bonus, fora do desafio)* | — |

### Payload exato do desafio

```json
{
  "adId":          "ad_8f3k29",        // string obrigatório, não-vazio
  "tenantId":      "tenant_acme",      // string obrigatório, não-vazio
  "violationType": "PROHIBITED_TERM",  // enum: PROHIBITED_TERM | BRAND_VIOLATION | COMPLIANCE_FAIL
  "severity":      "CRITICAL",         // enum: LOW | MEDIUM | HIGH | CRITICAL
  "detectedAt":    "2026-05-21T14:23:01Z"  // ISO 8601
}
```

Schema é **`.strict()`** — campos extras viram `400` automaticamente.

### Shape exato de `GET /jobs/:id`

```json
{
  "jobId":   "tenant_acme:ad_8f3k29",
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

`status` ∈ `waiting · active · delayed · completed · failed · waiting-children` · `404` se job não existir.

---

## 🧪 Testes (XP Gate)

### 57 testes em 11 arquivos · 97% coverage

| Arquivo | Cobre |
|---|---|
| `schemas/violation.test.ts` (7) | schema valid/invalid · ISO 8601 · strict · combinações |
| `queue/violationQueue.test.ts` (7) | `buildJobId` · severity routing · backoff |
| `routes/_jobState.test.ts` (3) | IN_FLIGHT_STATES + isInFlight |
| `routes/webhook.test.ts` (8) | POST integration · 202/400/200 dedup |
| `routes/jobs.test.ts` (4) | GET shape pra cada estado |
| `routes/health.test.ts` (3) | redis up/down + queue counts |
| `routes/deadletter.test.ts` (4) | listagem failed + limit + cap |
| `routes/metrics.test.ts` (4) | formato Prometheus + uptime |
| `worker/upstream.test.ts` (5) | 2xx · 4xx · 5xx · timeout · network |
| `worker/processor.test.ts` (4) | propagação UpstreamError + TakedownResult |
| `lib/requestId.test.ts` (3) | correlation id (gerado / cliente / inválido) |
| **`e2e.test.ts` (6)** | **end-to-end real com Redis (testcontainers) + Worker live** |

### E2E real cobre comportamento que mocks não conseguem

```
✓ happy path                  POST → worker → completed em ~200ms
✓ retry: falha 2x e sucede 3ª  attempts=3, completed
✓ falha definitiva 3 tentativas attempts=3, failed, error preenchido
✓ idempotência concorrente     2 POST simultâneos → 1 job só
✓ idempotência sequencial      POST durante active → 200 dedup
✓ 404                         job não existe
```

Roda automaticamente no CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) com Redis service container. Localmente faz `skip` quando Docker não está disponível.

### XP Gate completo

```bash
cd backend
npm run check
```

Executa em sequência:

| Check | Comando | Resultado |
|---|---|---|
| ESLint 9 + typescript-eslint **strict-type-checked** | `npm run lint` | ✅ 0 errors |
| TypeScript `strict + noUncheckedIndexedAccess` | `npm run typecheck` | ✅ 0 errors |
| Prettier | `npm run format:check` | ✅ all clean |
| Vitest (57 + 6 E2E) | `npm test` | ✅ all green |
| Coverage com thresholds (90% lines, 95% funcs) | `npm run test:coverage` | ✅ 97% / 100% |
| Dependency audit | `npm run audit` | ✅ 0 vulnerabilidades |

---

## ⚙️ Variáveis de ambiente

```bash
# backend/.env
PORT=3001
QUEUE_NAME=ad-processing
WORKER_CONCURRENCY=5

# Redis local (Docker)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
# OU Upstash:
# REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:6379

# Upstream (desafio usa JSONPlaceholder)
UPSTREAM_URL=https://jsonplaceholder.typicode.com/posts/1
UPSTREAM_TIMEOUT_MS=5000
```

Todas validadas via Zod em [backend/src/config/env.ts](backend/src/config/env.ts) — boot falha cedo se inválidas.

---

## 🎚 Severity-driven retry (extra dentro do tema)

O desafio pede `attempts: 3 + backoff exponencial`. Esse mínimo está cumprido. O enum de `severity` foi aproveitado pra escalar a resposta:

| Severity | Priority (menor = primeiro) | Attempts |
|---|---|---|
| `CRITICAL` | 1 | **5** |
| `HIGH` | 2 | 4 |
| `MEDIUM` | 3 | 3 *(default do desafio)* |
| `LOW` | 4 | 3 *(default do desafio)* |

Backoff exponencial `1s/2s/4s` em todos os níveis. Pure function em [jobOptions.ts](backend/src/queue/jobOptions.ts) com 7 testes.

---

## 📜 Scripts de raiz

| Comando | O que faz |
|---|---|
| `npm run install:all` | instala root + backend + frontend |
| `npm run dev` | sobe backend + frontend juntos (`concurrently`) |
| `npm run dev:backend` | só backend |
| `npm run redis:up` / `redis:down` | Docker compose pro Redis local |

### Scripts do backend (`cd backend && ...`)

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor com hot reload (tsx watch) |
| `npm test` | 57 testes + 6 E2E (skip se sem Docker) |
| `npm run test:coverage` | + thresholds + relatório HTML |
| `npm run lint` | ESLint 9 strict-type-checked |
| `npm run format` | Prettier write |
| `npm run typecheck` | `tsc --noEmit` strict |
| `npm run audit` | `npm audit --audit-level=moderate` |
| **`npm run check`** | **XP gate: lint + typecheck + format:check + test em sequência** |
| `npm run build` | compila pra `dist/` |

---

## 🏗 Disciplina técnica aplicada (XP)

1. **TDD em cada feature** — vermelho → verde → refator. Bug do `AbortError` no Node 18+ undici foi detectado pelo teste antes do código.
2. **Menor diff possível** — extrações (`upstream`, `processor`, `_jobState`, `factory`, `createWorker`) só onde reduziam risco. Sem renomear/mover por estética.
3. **Sem `any` espalhado** — `strict + noUncheckedIndexedAccess` no TS; ESLint `strictTypeChecked` no lint; `unknown` em catch.
4. **YAGNI** — campos não-utilizados removidos do retorno do upstream; nada antecipado.
5. **Pure functions separadas do I/O** — `buildJobId`, `jobOptionsFor`, `isInFlight`, `isAbortError` testáveis sem Redis.
6. **DI leve** — `callUpstream(url, timeout, fetchImpl)`, `createViolationQueue(name, connection)`, `createTakedownWorker(name, connection)` permitem testes com Redis real OU mock conforme contexto.
7. **Observability** — pino structured logs + correlation id (X-Request-Id) + `/health` + `/metrics` + dead-letter inspection.
8. **CI verde antes de merge** — workflow GitHub Actions com Redis service container; XP gate completo em cada PR.

Roadmap detalhado de 9 → 10: [backend/ROADMAP.md](backend/ROADMAP.md).

---

## 🎁 Produto FURY construído em volta do core

Pra mostrar o que o desafio resolve no mundo real, construí o produto completo
em volta do núcleo do webhook. Tudo em arquivos separados — **não interfere com
o fluxo do desafio**. O núcleo (`webhook → fila → worker → status`) roda
isolado com `cd backend && npm run dev`.

### Frontend ([frontend/](frontend/))

- **Landing page** — Vite + React + GSAP (ScrollTrigger + SplitText) + R3F (modelo 3D do logo FURY interativo) + Clash Display + Satoshi via Fontshare · 12 seções com animações cinematográficas, vídeo de background processado, splash de abertura com iris reveal, cursor customizado com trail de embers, design system completo com tokens
- **Dashboard pós-login** ([frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx)) — sidebar custom adaptada do design system, painel ao vivo simulando um cliente Acme Moda (ROAS em tempo real com Catmull-Rom spline, event log animado, severity donut, connections panel)
- **Login + Register** com PASETO V4 real ([frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)) — split-screen, password strength meter, OAuth mocks, error shake animation
- **Responsividade**: 5 breakpoints (375 / 640 / 960 / 1100 / 1400+), tested

### Backend bonus ([backend/src/auth/](backend/src/auth/))

- **Auth PASETO V4** com Ed25519 + bcrypt cost 12 · endpoints `POST /auth/register`, `POST /auth/login`, `GET /auth/me` + middleware `requireAuth` reusável em qualquer endpoint protegido

### Por que está aqui

O desafio pede uma mini-API isolada. Eu entreguei isso (e mais — coverage, E2E, CI), MAS também
quis mostrar como esse núcleo se encaixaria num produto real — porque é assim que código de
produção vive. Os extras estão em arquivos independentes, não acoplam com o core e não
poluem o XP gate do backend (auth está excluído do scope de coverage, frontend tem seu
próprio pipeline).
