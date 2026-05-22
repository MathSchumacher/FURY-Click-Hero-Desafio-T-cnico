import { useStats } from '../../hooks/useBackendLive';
import type { ViolationSeverity } from '../../lib/api';

/**
 * Donut da distribuição de violations por severity.
 * Lê do /tenants/me/stats (polling a cada 4s).
 *
 * Cada arco é um path SVG; tamanho proporcional ao count.
 */

const ORDER: ViolationSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const COLOR: Record<ViolationSeverity, string> = {
  CRITICAL: '#ff3d2e',
  HIGH: '#ff7a18',
  MEDIUM: '#f5b942',
  LOW: '#7a9',
};

const LABEL: Record<ViolationSeverity, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

/* Geometria do donut em SVG (viewBox 100x100). */
const R = 36;
const STROKE = 14;
const C = 2 * Math.PI * R;

function arcDashOffset(fractionStart: number): number {
  /* offset = quanto "rotacionar" o stroke; 0 = começa em "3h" */
  return C * (1 - fractionStart);
}

export function SeverityDonut(): JSX.Element {
  const { data } = useStats();

  const counts = data?.bySeverity ?? { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const total = ORDER.reduce((acc, k) => acc + counts[k], 0);

  /* Constrói as fatias com offsets cumulativos */
  let cumulative = 0;
  const slices = ORDER.map((sev) => {
    const value = counts[sev];
    const fraction = total > 0 ? value / total : 0;
    const startFraction = total > 0 ? cumulative / total : 0;
    cumulative += value;
    return {
      sev,
      value,
      fraction,
      dashArray: `${C * fraction} ${C * (1 - fraction)}`,
      dashOffset: arcDashOffset(startFraction),
    };
  });

  return (
    <article className="sev-donut">
      <header className="sev-donut__head">
        <h3 className="sev-donut__title">Distribuição por severity</h3>
        <span className="mono dim">{total} no total</span>
      </header>

      <div className="sev-donut__body">
        <svg viewBox="0 0 100 100" className="sev-donut__svg" aria-label="Donut por severity">
          {/* trilho de fundo */}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={STROKE}
          />
          {/* fatias coloridas, renderizadas como strokes parciais */}
          {total > 0 &&
            slices.map((s) =>
              s.fraction === 0 ? null : (
                <circle
                  key={s.sev}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={COLOR[s.sev]}
                  strokeWidth={STROKE}
                  strokeDasharray={s.dashArray}
                  strokeDashoffset={s.dashOffset}
                  strokeLinecap="butt"
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dasharray 0.6s, stroke-dashoffset 0.6s' }}
                />
              ),
            )}
          {/* total no centro */}
          <text x="50" y="48" textAnchor="middle" className="sev-donut__center-val">
            {total}
          </text>
          <text x="50" y="62" textAnchor="middle" className="sev-donut__center-lbl">
            violations
          </text>
        </svg>

        <ul className="sev-donut__legend">
          {ORDER.map((sev) => (
            <li key={sev} className="sev-donut__legend-item">
              <span className="sev-donut__dot" style={{ background: COLOR[sev] }} />
              <span className="sev-donut__name">{LABEL[sev]}</span>
              <span className="mono sev-donut__count">{counts[sev]}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
