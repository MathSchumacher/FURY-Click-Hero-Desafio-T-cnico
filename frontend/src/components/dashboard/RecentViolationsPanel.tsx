import { useEffect } from 'react';
import { useViolations } from '../../hooks/useBackendLive';
import type { ViolationListItem, ViolationSeverity } from '../../lib/api';

/**
 * Lista live dos últimos violations do tenant. Polling de 4s.
 * Mostra os 8 mais recentes — suficiente pro avaliador ver o efeito
 * imediato após disparar um SimulateViolation.
 */

const SEVERITY_COLOR: Record<ViolationSeverity, string> = {
  LOW: '#7a9',
  MEDIUM: '#f5b942',
  HIGH: '#ff7a18',
  CRITICAL: '#ff3d2e',
};

const STATUS_LABEL: Record<ViolationListItem['status'], string> = {
  queued: 'enfileirado',
  active: 'processando',
  completed: 'concluído',
  failed: 'falhou',
};

const TYPE_LABEL: Record<ViolationListItem['violationType'], string> = {
  PROHIBITED_TERM: 'Termo proibido',
  BRAND_VIOLATION: 'Violação de marca',
  COMPLIANCE_FAIL: 'Falha de compliance',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  return `${Math.floor(hr / 24)}d atrás`;
}

type Props = {
  /** Counter — Dashboard incrementa via SSE pra forçar refetch instantâneo. */
  refreshKey?: number;
};

export function RecentViolationsPanel({ refreshKey = 0 }: Props): JSX.Element {
  const { data, loading, error, refetch } = useViolations({ limit: 8 });

  /* Stream-driven refetch: Dashboard bumpa refreshKey quando chega event SSE. */
  useEffect(() => {
    if (refreshKey > 0) refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <article className="recent-viol">
      <header className="recent-viol__head">
        <h3 className="recent-viol__title">Violations recentes</h3>
        <span className="mono dim">
          {data ? `${data.total} no histórico · live` : 'carregando…'}
        </span>
      </header>

      {error && (
        <div className="recent-viol__empty">Erro ao carregar: {error.message}</div>
      )}

      {!error && !loading && data && data.items.length === 0 && (
        <div className="recent-viol__empty">
          Nenhuma violation ainda. Use o painel acima pra disparar a primeira.
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="recent-viol__list">
          {data.items.map((v) => (
            <li key={v.id} className="recent-viol__item">
              <span
                className="recent-viol__severity"
                style={{ background: SEVERITY_COLOR[v.severity] }}
                title={v.severity}
              />
              <div className="recent-viol__main">
                <div className="recent-viol__row1">
                  <span className="mono recent-viol__ad">{v.adId}</span>
                  <span className="dim mono">·</span>
                  <span className="recent-viol__type">{TYPE_LABEL[v.violationType]}</span>
                </div>
                <div className="recent-viol__row2 mono dim">
                  {relativeTime(v.createdAt)}
                  {v.upstreamLatencyMs !== null && ` · ${v.upstreamLatencyMs}ms`}
                  {v.attempts > 1 && ` · ${v.attempts} tentativas`}
                </div>
              </div>
              <span className={`recent-viol__status is-${v.status}`}>
                {STATUS_LABEL[v.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
