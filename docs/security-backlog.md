# Security Backlog · FURY

> Backlog vivo de issues de segurança identificados via auditoria contra o catálogo top-100 web vulnerabilities. Atualizado a cada review quinzenal.
>
> **Última auditoria:** 2026-05-22
> **Próxima auditoria:** 2026-06-05

## Legenda

| Severidade | Critério | SLA |
|---|---|---|
| 🔴 **CRÍTICO** | Bloqueia produção, abuso imediato possível, vazamento cross-tenant | 24h |
| 🟠 **ALTO** | Must-fix antes de comercializar, atacante motivado consegue explorar | 7d |
| 🟡 **MÉDIO** | Should-fix em algum momento, defense-in-depth | 30d |
| 🟢 **FEITO** | Resolvido — manter histórico pra audit trail | — |

---

## 🟢 Feito (Sprint 0 · 2026-05-22)

| Cat. | Issue | Como foi resolvido | Commit |
|---|---|---|---|
| 🔴 C2 | IDOR em `GET /jobs/:id` (jobId determinístico ↔ cross-tenant leak) | `requireAuth` + filtro `WHERE tenantId = claims.tenantId`. 404 (não 200) quando job é de outro tenant — privacy by default | [1385166](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/1385166) |
| 🔴 C3 | `GET /jobs/failed` listava failures globais com stack traces | Migrado de BullMQ queue → Prisma Violation com filter por tenant | [1385166](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/1385166) |
| 🔴 C4 | CORS `cors()` sem opções (any origin) | Allowlist explícita com Set: FRONTEND_URL + locais + CORS_ORIGINS extras. `credentials: true` | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A4 | Sem security headers | Helmet aplicado: CSP estrito em prod, HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A5 | Stack traces em response 500 (info disclosure) | Em prod: só `{ error, requestId }`. Em dev: mantém detalhes pra DX | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A9 | Logs sem redaction de PII/secrets | pino `redact` com paths sensíveis (password, token, authorization, cookie, apiKey, clientSecret, +variantes) → `[REDACTED]` | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A2 | Sem rate limiting em /auth e /webhook | 3 limiters: authLimiter (10/15min), webhookLimiter (60/min), apiLimiter (300/min por user). trust proxy ativo pro IP real | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A3 | Account enumeration via timing diff no login | `verifyPasswordSafe`: bcrypt.compare roda sempre, mesmo se user é null (DUMMY_HASH). Resposta uniforme `email ou senha incorretos` | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟠 A8 | esbuild CVE GHSA-67mh-4wv8-2f99 (via Vite) | Vite 5 → 8 (audit fix --force). Build 8x mais rápido com Rolldown como bonus | [3c3a0a6](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/3c3a0a6) |
| 🟡 M2 | Schemas Zod sem `.strict()` em auth | registerSchema e loginSchema agora `.strict()` — rejeita campos extras | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |
| 🟡 M10 | `/metrics` público vazava infra/queue counts | Token opcional via `METRICS_TOKEN` env (Bearer header) — público em dev, autenticado em prod | [940e761](https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/commit/940e761) |

---

## 🔴 Crítico pendente

| Cat. | Issue | Risco | Mitigação proposta | Sprint |
|---|---|---|---|---|
| C1 | Secrets aparecem no histórico de chat com IA (Upstash token, Google secret, Neon password) | Qualquer um com acesso ao log de IA tem credentials válidas | Rotacionar tudo via Console (Upstash · Google Cloud · Neon). Atualizar `.env` local + Render env. **User declinou rotacionar pra esse desafio** | n/a |
| C5 | `POST /webhook/violation` aceita qualquer payload externo (sem HMAC signature, sem IP allowlist) | Adversário com slug conhecido de tenant pode poluir fila + inflar billing | Tabela `TenantWebhookSecret` (gerada no register), header `X-FURY-Signature: HMAC-SHA256(rawBody, secret)`. Behind flag `WEBHOOK_REQUIRE_SIGNATURE=true` pra não quebrar o spec do desafio em dev/avaliação | Sprint 3 |

## 🟠 Alto pendente

| Cat. | Issue | Mitigação | Sprint |
|---|---|---|---|
| A1 | Token PASETO em localStorage → XSS = account takeover | Migrar pra HttpOnly + Secure + SameSite=Strict cookie. Ajustes em CORS (já com credentials:true) + frontend (fetch credentials: 'include') | Sprint 1 |
| A6 | Google OAuth `state` é apenas "login"/"register" — sem CSRF nonce | `state = base64({ nonce, intent })` com nonce em Redis (TTL 10min). Validar no callback | Sprint 1 |
| A7 | Sem email verification, password reset, MFA | Tabela `VerificationToken` + Resend free tier (email transactional) + flows `/auth/verify`, `/auth/forgot`, `/auth/reset`. MFA via TOTP (otplib) | Sprint 1-2 |

## 🟡 Médio pendente

| Cat. | Issue | Mitigação | Sprint |
|---|---|---|---|
| M1 | Race condition em dedup do webhook (gap getJob → getState) | Trocar polling por `Job.add({ jobId, ... })` direto — BullMQ é atomic com unique jobId. Cobrir com teste de concorrência | Sprint 3 |
| M3 | Sem token revocation (logout só apaga client) | Tabela `RevokedToken (jti, expiresAt)` + check no `requireAuth` ou Redis SET com TTL | Sprint 1 |
| M5 | Sessão fixa em 12h sem refresh token | Access token 15min + refresh token 30d em HttpOnly cookie. Rotação a cada refresh | Sprint 1 |
| M6 | Worker no mesmo processo do API | Separar em serviço Render dedicado (`backend.worker`), escala horizontal independente | Sprint 7 |
| M7 | `callUpstream` sem proteção contra response > X MB | Stream + `Content-Length` check < 1MB. Circuit breaker (`opossum`) | Sprint 5 |
| M9 | Sem audit log de ações sensíveis | Tabela `AuditEvent` (userId, tenantId, action, payload, ip, ua, createdAt). Login/Register/PasswordChange/IntegrationDelete/MembershipChange | Sprint 2 |
| M10 | Tenant slug previsível (firstname-suffix) facilita enumerar | Slug 100% random (cuid) OU esconder slug dos endpoints públicos | Sprint 3 |

---

## Processo de tracking

- Cada item virá com **issue no GitHub** quando entrar em sprint
- PRs referenciam o ID daqui no commit message
- Findings novos vão pra topo desta seção até serem triados na próxima review
- Audit trail das resoluções fica em "Feito" (não removido)
