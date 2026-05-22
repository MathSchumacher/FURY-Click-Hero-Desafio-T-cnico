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

## 🟢 Feito (Sprint 1 · 2026-05-22)

| Cat. | Issue | Como foi resolvido | Commit |
|---|---|---|---|
| 🟠 A6 | OAuth `state` era apenas "login"/"register" (sem CSRF protection) | `state = base64({ nonce, intent })`, com nonce em Redis (TTL 10min). `consumeOAuthState` valida + DEL atomic — single-shot, sem replay. Em [auth/oauthState.ts](../backend/src/auth/oauthState.ts) | _Sprint 1_ |
| 🟡 M3 | Logout só apagava client-side; token sequestrado continuava válido por 12h | `POST /auth/logout` adiciona `jti` em Redis deny list (TTL = exp natural do token). `requireAuth` agora consulta `isRevoked(jti)` em cada request. PASETO `signToken` gera `jti` UUID por default. Em [auth/revocation.ts](../backend/src/auth/revocation.ts) | _Sprint 1_ |
| 🟡 M9 | Sem audit log de ações sensíveis | Tabela `AuditEvent` (action, userId, tenantId, metadata, ipAddress, userAgent, createdAt) + enum `AuditAction` (20 ações). Helper `recordAudit` em [lib/audit.ts](../backend/src/lib/audit.ts) — best-effort, com guardas anti-vazamento de password/token no metadata. Integrado em register/login (success+fail)/Google sign-up/Google link/logout | _Sprint 1_ |
| 🟠 A7 | Sem email verification + password reset | Schema novo: `User.emailVerified` + tabela `VerificationToken` (tokenHash SHA-256, purpose enum, expiresAt, usedAt, FK user). Helper `auth/verification.ts` com `issueVerificationToken` (invalida anteriores do mesmo purpose) + `consumeVerificationToken` (single-use, purpose-checked, expiry-checked). 4 endpoints: `POST /auth/forgot-password` (uniform 200 anti-enumeração), `POST /auth/reset-password`, `POST /auth/verify-email/request` (autenticado), `POST /auth/verify-email/confirm`. Sender com stub em prod + logging do link em dev (11 testes unit). Audit log emitido em todas as 4 ações | _Sprint 1_ |
| 🟠 A1 | Token PASETO em localStorage = XSS → account takeover | Backend: cookie `fury_session` HttpOnly + Secure + SameSite=None (prod) / Lax (dev), maxAge 12h. requireAuth lê cookie primeiro, cai pro Bearer (backward compat pra curl/API). Frontend: zero localStorage de token; `credentials:'include'` em todas as chamadas; useAuth valida via `/auth/me` em mount em vez de inferir do localStorage. AuthCallback ignora `?token=` da URL (backend já setou cookie). XSS no JS já não consegue ler token. Em [auth/cookies.ts](../backend/src/auth/cookies.ts) | _Sprint 1_ |
| 🟠 (novo) | Cookies cross-origin (Netlify ↔ Render) bloqueados por ITP/3rd-party policy | Netlify rewrite `/api/* → Render` em [netlify.toml](../netlify.toml) + [public/_redirects](../frontend/public/_redirects). Browser vê tudo same-origin de Netlify; cookies setados pelo Render passam pelo proxy e viram first-party de Netlify. Frontend hard-codeia `API_BASE = '/api'` (Vite proxy em dev, Netlify proxy em prod). Requer `GOOGLE_REDIRECT_URI` apontando pro Netlify, não Render | _Sprint 1_ |
| 🟠 (CSRF) | Cookies via SameSite=None expõem a CSRF | Double-submit cookie pattern: cookie `fury_csrf` NÃO-HttpOnly (legível por JS) setado no login/register/google callback. Middleware `csrfProtection` em [auth/csrf.ts](../backend/src/auth/csrf.ts) compara cookie vs header `X-CSRF-Token` com `timingSafeEqual`. Aplicado em /auth/logout e /auth/verify-email/request. Endpoints pré-sessão (login/register/forgot/reset) e webhook são out-of-scope por design (sem cookie de sessão ainda OU autenticados por outros meios). Frontend `api.ts` lê o cookie e injeta o header em qualquer fetch não-safe (POST/PATCH/DELETE/PUT). CORS allowlist atualizada pra incluir `X-CSRF-Token`. 9 testes unit | _Sprint 1_ |
| 🟡 M1 | Race condition no dedup do webhook (gap getJob → getState) | Reescrita usando Prisma `@@unique([tenantId, jobId])` como atomic primitive: tenta `violation.create`, em P2002 cai no caminho de dedup (200 se QUEUED/ACTIVE, update+re-enqueue se COMPLETED/FAILED). BullMQ.add com jobId já era idempotent. 2 requests concorrentes garantem 1 row no DB + resposta diferenciada (1×202+1×200) | _Sprint 1_ |
| 🔴 C5 | `POST /webhook/violation` aceita qualquer payload sem HMAC | Tenant ganha `webhookSecret String?` (gerado no register/Google signup). Helper `auth/webhookSignature.ts`: HMAC-SHA256 do raw body, timing-safe compare, header `X-FURY-Signature: sha256=<hex>`. Middleware no /webhook/violation opt-in via env `WEBHOOK_REQUIRE_SIGNATURE=true` (default false pra não quebrar curl do README). `express.json({ verify })` captura rawBody. 15 testes unit | _Sprint 1_ |

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

## 🟠 Alto pendente

| Cat. | Issue | Mitigação | Sprint |
|---|---|---|---|
| MFA | Sem 2FA disponível pros users | TOTP via otplib + tabela `MfaSecret` opcional + endpoint /auth/mfa/enable/disable/verify. Bonus: WebAuthn pra passkeys | Sprint 2 |

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
