import { useHealth } from '../../hooks/useBackendLive';

/**
 * Painel de saúde das conexões do backend.
 * Consome /health (polling 5s) e mostra:
 *   - Redis (Upstash) — up/down + nome da fila
 *   - Worker queue depth — waiting/active/completed/failed
 *   - Uptime do backend
 *   - Latência do health check
 */

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m ${seconds % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  return `${Math.floor(hr / 24)}d ${hr % 24}h`;
}

export function ConnectionsHealth(): JSX.Element {
  const { data, loading, error } = useHealth();

  const redisUp = data?.redis === 'up';
  const ok = data?.ok ?? false;
  const queueDepth = data?.queue?.counts;

  return (
    <article className="conn-health">
      <header className="conn-health__head">
        <h3 className="conn-health__title">Saúde da infraestrutura</h3>
        <span className={`conn-health__pulse ${ok ? 'is-up' : 'is-down'}`} aria-hidden="true" />
      </header>

      {error && (
        <div className="conn-health__error">
          Backend offline ou inacessível: {error.message}
        </div>
      )}

      {loading && !data && (
        <div className="conn-health__skeleton mono dim">conectando…</div>
      )}

      {data && (
        <ul className="conn-health__list">
          <li className="conn-health__item">
            <span className="conn-health__mark" style={{ background: '#DC382D' }}>R</span>
            <div className="conn-health__info">
              <div className="conn-health__name">Redis (Upstash)</div>
              <div className="conn-health__meta mono">queue: {data.queue.name}</div>
            </div>
            <span className={`conn-health__status ${redisUp ? 'is-on' : 'is-off'}`}>
              {redisUp ? 'online' : 'offline'}
            </span>
          </li>

          <li className="conn-health__item">
            <span className="conn-health__mark" style={{ background: '#2bd279' }}>W</span>
            <div className="conn-health__info">
              <div className="conn-health__name">BullMQ Worker</div>
              <div className="conn-health__meta mono">
                {queueDepth ? (
                  <>
                    waiting {queueDepth.waiting} · active {queueDepth.active} · completed{' '}
                    {queueDepth.completed} · failed {queueDepth.failed}
                  </>
                ) : (
                  'sem métricas'
                )}
              </div>
            </div>
            <span className="conn-health__status is-on">processando</span>
          </li>

          <li className="conn-health__item">
            <span className="conn-health__mark" style={{ background: '#ff7a18' }}>API</span>
            <div className="conn-health__info">
              <div className="conn-health__name">Backend (Render)</div>
              <div className="conn-health__meta mono">
                uptime {formatUptime(data.uptimeSeconds)} · ping {data.checkDurationMs}ms
              </div>
            </div>
            <span className="conn-health__status is-on">live</span>
          </li>
        </ul>
      )}
    </article>
  );
}
