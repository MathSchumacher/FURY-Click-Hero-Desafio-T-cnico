# Review Cadence · FURY

> Calendário operacional pra manter qualidade, segurança, performance e custo sob controle a longo prazo.
>
> Cada item lista *o que*, *quando*, *quem* (responsável + reviewer), *ferramenta* e *output esperado* (artefato consultável).

---

## A cada PR (automatizado · CI)

| Check | Ferramenta | Bloqueia merge? |
|---|---|---|
| Lint (ESLint flat config, strict-type-checked) | `npm run lint` em GitHub Actions | ✅ |
| Typecheck (`tsc --noEmit`) | `npm run typecheck` | ✅ |
| Formatação (Prettier) | `npm run format:check` | ✅ |
| Test unit + integration (Vitest) | `npm test` | ✅ |
| Coverage thresholds (≥95% statements no core) | `npm run test:coverage` | ✅ |
| Dependency audit (CVEs novas) | `npm audit --audit-level=moderate` | ⚠️ alerta no PR |
| Build de produção | `npm run build` (backend + frontend) | ✅ |

CI definido em [.github/workflows/ci.yml](../.github/workflows/ci.yml). Toda PR roda contra ambiente real com Redis service container.

---

## A cada PR (humano · /ultrareview)

Reviewer humano (ou agent multi-eyed) corre `/ultrareview <PR#>` antes de aprovar. Output: comentários estruturados por categoria (correctness · security · perf · maintainability · tests).

---

## Cadência regular

| Frequência | O que | Ferramenta · Responsável | Output esperado |
|---|---|---|---|
| **Diário** | Dependabot scan + auto-PR pra deps com CVE | GitHub Dependabot (config em `.github/dependabot.yml`) | PR auto-merged se patch + CI verde |
| **Semanal · 2ª** | Bundle size diff vs main | bundlemon ou pacote no CI · Frontend lead | Alert se +10% no `index.js` |
| **Semanal · 2ª** | Lighthouse CI rodando contra Netlify preview | `@lhci/cli` integrado no Netlify build hook | Trend de Core Web Vitals (LCP/TTI/CLS) em `docs/lighthouse-trend.json` |
| **Semanal · 5ª** | Cost review (Render + Neon + Upstash + Netlify) | Planilha + leitura de billing dashboards · Tech lead | Forecast atualizado em `docs/cost-forecast.md` |
| **Quinzenal** | Security audit guiado pelo top-100 catalog | `~/.agents/skills/top-100-web-vulnerabilities-reference/SKILL.md` · Security lead | Update em [security-backlog.md](security-backlog.md) |
| **Quinzenal** | Performance review com APM (Datadog free tier) | Datadog dashboard + `pg_stat_statements` · Backend lead | Hot spots → tickets de perf no GitHub Project |
| **Mensal** | DB slow query audit + reindex check | Neon dashboard + `EXPLAIN ANALYZE` em queries P95 > 500ms · DBA/Backend | Migrations novas com indexes ou refactor |
| **Mensal** | Log volume + error rate review | Render logs + Sentry quota · SRE | Alertas ajustados; PRs pra logs ruidosos |
| **Mensal** | Coverage trend | `npm run test:coverage` histórico salvo em `docs/coverage-history/` · QA | Identificar arquivos com cobertura caindo |
| **Trimestral** | Threat model update | OWASP Threat Dragon · Security lead | `docs/threat-model.md` revisado |
| **Trimestral** | Backup/restore drill (Neon point-in-time recovery) | Manual playbook em `docs/runbooks/restore.md` · SRE | Confirma DR < 4h objetivo |
| **Trimestral** | Disaster recovery tabletop exercise (Redis down · DB down · Render down) | Reunião + simulação · Time inteiro | Runbooks atualizados |
| **Semestral** | Pentest externo | Empresa de security (HackerOne private bug bounty ou contratado) · Security | Relatório + remediation tracker |
| **Semestral** | Dependency major version upgrade window (Express, Prisma, Vite, React) | `npm-check-updates` + branch dedicada · Tech lead | PRs separadas por categoria; risco isolado |
| **Anual** | Re-cert LGPD (Brasil) | DPO + advogado · Compliance | Evidência docs pra clientes enterprise |
| **Anual** | Penetração simulada de equipe interna (red team exercise) | Time SRE+Security em sandbox · Security lead | Lessons learned · controles novos |

---

## Métricas observáveis (SLOs declarados)

Definidos em `docs/slo.md` (a criar). Monitorados via Datadog/Grafana.

```
Availability:               99.9% (downtime ≤ 43min/mês)
P50 API latency:            < 100ms
P95 API latency:            < 500ms
P99 API latency:            < 2s
Webhook → completion P95:   < 5s (incluso retries)
Error rate:                 < 0.1%
Coverage do core (backend): ≥ 95%
Dependency CVE high+:       0 outstanding > 7d
Security backlog 🔴:        0 outstanding > 24h
Security backlog 🟠:        ≤ 3 outstanding
```

Quebra de SLO dispara post-mortem (template em `docs/postmortem-template.md`).

---

## Como adicionar item novo a esta cadência

1. Identifique a frequência apropriada (não jogue tudo em "diário")
2. Defina responsável + reviewer (não pode ser a mesma pessoa)
3. Liste ferramenta concreta (não "alguém olha")
4. Defina output verificável (planilha, dashboard, PR, doc, etc.)
5. Atualize esta tabela + commit
