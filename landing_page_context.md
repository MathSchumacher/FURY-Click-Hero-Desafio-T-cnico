# FURY — Landing Page Context

> Documento de referência para construir a landing page do FURY.
> Contém: posicionamento, copy pronta, hierarquia de seções, header e direção de design system.

---

## 1. O que é o FURY (1 frase)

**FURY é um control plane autônomo para enforcement de anúncios pagos** — recebe sinais externos (webhooks de plataformas como Meta Ads), classifica risco por severidade e executa ações automáticas (takedown, pausa, alerta) através de um pipeline event-driven resiliente.

Não é um dashboard. Não é um detector. É a **camada de execução** entre detecção e ação.

---

## 2. Para quem é

- **Times de mídia paga enterprise** rodando campanhas em escala (>100 anúncios ativos)
- **Agências e holdings** com múltiplos tenants/contas
- **Times de compliance / brand safety** que precisam responder em segundos, não horas
- **Ad ops / RevOps** com tolerância zero a contas bloqueadas

---

## 3. Problema que resolve

> "Quando algo dá errado em um anúncio, normalmente você descobre tarde demais."

Hoje o ciclo é reativo:
1. Anúncio viola política
2. Plataforma penaliza/restringe
3. Time descobre via alerta manual ou dashboard
4. Reage horas depois
5. Já perdeu budget, conta foi flaggeada, compliance está em risco

FURY inverte: **detecção → ação automática em milissegundos**, sem humano no loop.

---

## 4. Posicionamento e tom

### O que parecer
- Infraestrutura crítica (Datadog, Stripe, Vercel observability, Palantir)
- Sistema técnico de alto desempenho
- Enterprise SaaS de IA

### O que NÃO parecer
- Webhook API genérica
- Dashboard de monitoramento
- "Mais um SaaS de ads"
- Projeto técnico / hobby

### Tom de voz
- Técnico, preciso, agressivo
- Linguagem de infraestrutura (control plane, enforcement layer, pipeline, traceable)
- Frases curtas, declarativas
- Sem hype de IA genérico ("powered by AI" só onde agrega)
- Inspirações de copy: **Stripe, Linear, Vercel, Datadog**

---

## 5. Header (Navbar)

Layout limpo, peso de infra tool:

| Esquerda | Centro | Direita |
|---|---|---|
| **FURY** (wordmark) | Product · How it works · Security · Docs | Sign in · **Request access** (CTA primário) |

- Sem dropdowns complexos
- Borda inferior sutil ou backdrop blur no scroll
- Logo simples, monoespaçado/grotesk, peso forte

---

## 6. Hero (primeira dobra)

### Eyebrow (opcional, acima do título)
`Autonomous Ad Infrastructure`

### Headline (escolher uma)

**Opção A — direta:**
> Detect. Decide. Execute. — Automatically.

**Opção B — enterprise:**
> Real-time enforcement layer for paid media systems.

**Opção C — recomendada:**
> Autonomous Ad Enforcement for Modern Media Teams

### Subheadline
> FURY monitors advertising events in real time, detects policy violations, and executes automated actions through a resilient event-driven pipeline — before they impact performance or compliance.

### CTAs
- **Primário:** `Request access`
- **Secundário:** `View architecture`

### Microprova técnica (abaixo dos CTAs, em chips/badges)
- Event-driven architecture
- Queue-based processing
- Meta Ads compatible workflow
- Real-time enforcement engine

### Visual sugerido
- Animação sutil de pipeline: webhook → queue → worker → action
- Glow vermelho/laranja em pontos críticos
- Pode ter um "console" ao lado com logs ao vivo (mock) — estilo Vercel/Datadog

---

## 7. Seções abaixo da hero (ordem narrativa)

### Seção 2 — What it does

**Headline:** From signal to action in milliseconds

**Copy:**
> FURY transforms external ad signals into automated enforcement actions through a fully asynchronous pipeline.

**Visual:** fluxo horizontal de 5 steps
1. Incoming webhook detection
2. Payload validation and classification
3. Queue-based processing (BullMQ)
4. Worker execution layer
5. External API enforcement

---

### Seção 3 — Problem

**Headline:** Ad compliance failures are silent — until they are expensive.

**Copy:**
> Modern advertising systems operate at scale, but enforcement is still reactive. By the time a violation is detected manually:

- Campaigns may already be restricted
- Accounts may be flagged
- Budget is already lost
- Compliance risk has increased

**Visual:** stat cards ou timeline mostrando o gap entre detecção e ação manual.

---

### Seção 4 — Solution

**Headline:** An autonomous enforcement layer for ad infrastructure.

**Copy:**
> FURY acts as a control system between detection and execution.
>
> Instead of alerts → it performs actions.
> Instead of dashboards → it enforces outcomes.

---

### Seção 5 — How it works (arquitetura)

**Headline:** Built for reliability, not just visibility.

**Copy:**
> Every event passes through a deterministic pipeline:

1. Event ingestion via webhook
2. Schema validation (Zod)
3. Queue dispatch (BullMQ)
4. Worker processing layer
5. External enforcement API call
6. Job state tracking

**Frase de impacto (destaque visual):**
> Every action is traceable, retryable, and observable.

**Visual:** diagrama de arquitetura — boxes conectados com setas, estilo Vercel/Stripe infra.

---

### Seção 6 — Severity-driven decisions (diferencial)

**Headline:** Not just detection — decision execution.

**Copy:**
> Each violation is classified by severity and routed accordingly:

| Severity | Action |
|---|---|
| **LOW** | logged |
| **MEDIUM** | monitored |
| **HIGH** | queued for action |
| **CRITICAL** | immediate enforcement |

**Visual:** 4 pills coloridas (cinza → amarelo → laranja → vermelho pulsante).

---

### Seção 7 — Use cases

**Headline:** Designed for high-scale media operations.

Lista em grid 2x3:
- Automatic takedown of non-compliant ads
- Brand safety enforcement in real time
- Policy violation response automation
- Risk-based campaign interruption
- Multi-tenant ad monitoring systems
- Compliance audit trails

---

### Seção 8 — Reliability

**Headline:** Built for failure tolerance.

**Copy:**
> FURY is designed to operate under failure conditions:

- Retry mechanisms with exponential backoff
- Queue persistence under load
- Worker isolation per tenant
- Idempotent job execution
- Full job state recovery

---

### Seção 9 — Observability

**Headline:** Every action is trackable.

**Copy:**
> Each enforcement job exposes:

- Execution status (queued, active, completed, failed)
- Processing history and attempt count
- Success/failure state
- External API response

**Visual:** mock de UI mostrando um job tracker com timeline.

---

### Seção 10 — CTA final

**Headline:** Stop reacting to ad violations. Start enforcing them automatically.

**Sub:**
> Join the next generation of autonomous media infrastructure.

**Botão:** `Request access`

---

### Footer

- Wordmark FURY + tagline curta ("Autonomous ad enforcement.")
- Colunas: Product · Developers · Company · Legal
- Links sociais (GitHub icon ok)
- © 2026 FURY

---

## 8. Design System

### Personalidade visual
- Agressivo, técnico, preciso
- "Infraestrutura de guerra digital"
- Dark mode default (sem light mode na v1)

### Cores

```
--bg-primary:    #0a0a0c   /* preto profundo */
--bg-surface:    #111114   /* surface 1 */
--bg-elevated:   #18181c   /* surface 2 (cards) */
--border:        #26262b   /* divisores sutis */

--text-primary:  #f5f5f7
--text-muted:    #8a8a93
--text-faint:    #5a5a63

--accent:        #ff3d2e   /* vermelho fogo — primária */
--accent-hot:    #ff7a18   /* laranja execução */
--accent-glow:   rgba(255, 61, 46, 0.35)

--severity-low:      #6b7280   /* cinza */
--severity-medium:   #f5b942   /* amarelo */
--severity-high:     #ff7a18   /* laranja */
--severity-critical: #ff3d2e   /* vermelho pulsante */

--system-blue:   #4f8cff      /* indicadores técnicos (data, IA) */
--success:       #2bd279      /* completed states */
```

### Tipografia
- **Display/Headlines:** Space Grotesk ou Satoshi (700–900)
- **Body:** Inter (400–500)
- **Mono (código/logs/IDs):** JetBrains Mono ou Geist Mono

### Componentes-chave a aparecer na landing
1. **Severity pill** — badge com cor por severidade, CRITICAL com glow pulsante
2. **Pipeline diagram** — boxes conectados, com glow nos arcos ativos
3. **Job card** — adId, tenantId, severity, status, attempts
4. **Mock console** — terminal-like com logs de webhook → worker
5. **Code block** — exemplo do payload do webhook (mostra credibilidade técnica)
6. **CTA button** — sólido vermelho com glow no hover

### Estilo geral
- Linhas finas (1px) com baixa opacidade para divisões
- Glow sutil em ações críticas
- Texturas grain leve no background (opcional)
- Sem gradientes coloridos exagerados — gradiente só em accents (preto → vermelho escuro)
- Animações: fade-in on scroll, pulse nos badges critical, fluxo animado no pipeline

### Referências visuais
- **Datadog** (observability, dark dashboards)
- **Vercel** (clean enterprise dev tool)
- **Stripe** (copy + hierarquia)
- **Linear** (refinamento)
- **Palantir** (vibe "infra crítica")

---

## 9. Snippet técnico para credibilidade

Mostrar isso em algum lugar (seção de arquitetura ou hero secundário) ajuda muito:

```http
POST /webhook/violation
Content-Type: application/json

{
  "adId": "ad_8f3k29",
  "tenantId": "tenant_acme",
  "violationType": "PROHIBITED_TERM",
  "severity": "CRITICAL",
  "detectedAt": "2026-05-21T14:23:01Z"
}
```

```http
GET /jobs/:id

{
  "jobId": "tenant_acme:ad_8f3k29",
  "status": "completed",
  "attempts": 1,
  "result": { "action": "takedown", "platform": "meta" },
  "error": null
}
```

Tipo "ver é crer" — mostra que existe API real por trás.

---

## 10. Resumo (one-liner para uso interno)

> **FURY** = control plane autônomo de enforcement de ads. Webhook in → ação executada out. Sem dashboard, sem alerta — só decisão e ação, com retry, observability e severity-based routing.
