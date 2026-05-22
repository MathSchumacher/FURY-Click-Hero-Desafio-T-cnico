import { useEffect, useMemo, useRef, useState } from 'react';

/* ── Config ─────────────────────────────────────────────── */
const N_POINTS = 36;
const TICK_MS = 1300;
const EVENT_EVERY_MS = 7000;
/* Proporção próxima da largura real renderizada (~7:1) pra evitar que o SVG
   estique horizontalmente — quando viewBox e container têm aspect-ratio
   muito diferentes + preserveAspectRatio="none", as letras distorcem. */
const CHART_W = 1400;
const CHART_H = 200;
const PAD_T = 14;
const PAD_B = 28;
const PAD_L = 36;
const PAD_R = 12;

/* ── Mock client ────────────────────────────────────────── */
const CLIENT = {
  name: 'Acme Moda',
  tier: 'PRO',
  platform: 'Meta Ads',
  totalAds: 47,
};

/* ── Types ──────────────────────────────────────────────── */
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type EventKind = 'detection' | 'action';
type EventItem = {
  id: number;
  time: string;
  kind: EventKind;
  severity?: Severity;
  message: string;
  detail?: string;
};

/* ── Mock event templates ───────────────────────────────── */
const EVENT_TEMPLATES: Array<{
  severity: Severity;
  detection: string;
  action: string;
  responseMs: number;
}> = [
  { severity: 'HIGH',     detection: 'Brand violation em "Coleção Verão"',     action: 'Anúncio derrubado',       responseMs: 412 },
  { severity: 'MEDIUM',   detection: 'Palavra proibida em criativo novo',     action: 'Anúncio pausado',          responseMs: 280 },
  { severity: 'CRITICAL', detection: 'Compliance fail · conta em risco',     action: 'Takedown imediato',        responseMs: 510 },
  { severity: 'LOW',      detection: 'Performance abaixo do threshold',       action: 'Registrado em audit log',  responseMs: 90 },
  { severity: 'HIGH',     detection: 'Imagem viola política de saúde',       action: 'Criativo bloqueado',       responseMs: 380 },
  { severity: 'MEDIUM',   detection: 'CTA agressivo · risco de flag',         action: 'Conjunto pausado',         responseMs: 215 },
  { severity: 'CRITICAL', detection: 'Múltiplas reclamações em campanha',     action: 'Campanha derrubada',       responseMs: 640 },
  { severity: 'HIGH',     detection: 'Brand safety alert em vídeo',           action: 'Vídeo removido',           responseMs: 470 },
];

function formatTimeNow(offsetSec = 0): string {
  const d = new Date(Date.now() - offsetSec * 1000);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function seedEvents(): EventItem[] {
  const out: EventItem[] = [];
  let id = 0;
  for (let i = 0; i < 4; i++) {
    const t = EVENT_TEMPLATES[(i * 2) % EVENT_TEMPLATES.length]!;
    const offsetSec = 60 + i * 180 + Math.random() * 90;
    const time = formatTimeNow(offsetSec);
    out.push({ id: id++, time, kind: 'detection', severity: t.severity, message: t.detection });
    out.push({ id: id++, time, kind: 'action', message: `${t.action} · ${t.responseMs}ms`, detail: `attempt 1 · 200 OK` });
  }
  return out;
}

/* ── ROAS series engine ─────────────────────────────────── */
function nextRoas(prev: number): number {
  const drift = 0.020;
  const noise = (Math.random() - 0.46) * 0.14;
  let v = prev + drift + noise;
  if (Math.random() < 0.07) v -= 0.07;
  if (v < 0.20) v = 0.20 + Math.random() * 0.06;
  if (v > 0.95) v = 0.90 + Math.random() * 0.04;
  return v;
}
function seedRoas(): number[] {
  const out: number[] = [0.32];
  for (let i = 1; i < N_POINTS; i++) out.push(nextRoas(out[i - 1]!));
  return out;
}

/* ── Catmull-Rom → cubic-Bezier path ────────────────────── */
function smoothPath(pts: number[]): string {
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;
  const step = innerW / (pts.length - 1);
  const xOf = (i: number): number => PAD_L + i * step;
  const yOf = (v: number): number => PAD_T + (1 - v) * innerH;
  if (pts.length < 2) return '';
  let d = `M ${xOf(0)} ${yOf(pts[0]!)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = xOf(Math.max(i - 1, 0));
    const x1 = xOf(i);
    const x2 = xOf(i + 1);
    const x3 = xOf(Math.min(i + 2, pts.length - 1));
    const y0 = yOf(pts[Math.max(i - 1, 0)]!);
    const y1 = yOf(pts[i]!);
    const y2 = yOf(pts[i + 1]!);
    const y3 = yOf(pts[Math.min(i + 2, pts.length - 1)]!);
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }
  return d;
}
function areaPath(linePath: string): string {
  return `${linePath} L ${CHART_W - PAD_R} ${CHART_H - PAD_B} L ${PAD_L} ${CHART_H - PAD_B} Z`;
}

/* ── Compact sparkline path (for stat cards) ────────────── */
function sparklinePath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = Math.max(max - min, 0.001);
  const step = w / (pts.length - 1);
  return pts.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/* ── Severity donut (static) ────────────────────────────── */
const SEVERITY_DIST = [
  { key: 'LOW',      pct: 45, color: '#6b7280' },
  { key: 'MEDIUM',   pct: 32, color: '#f5b942' },
  { key: 'HIGH',     pct: 18, color: '#ff7a18' },
  { key: 'CRITICAL', pct: 5,  color: '#ff3d2e' },
] as const;

function SeverityDonut(): JSX.Element {
  const radius = 42;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="live-dash__donut-wrap" role="img" aria-label="Distribuição de severidades nas últimas 24h">
      <svg viewBox="0 0 120 120" className="live-dash__donut">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {SEVERITY_DIST.map((s) => {
          const dash = (s.pct / 100) * circumference;
          const gap = circumference - dash;
          const dashArray = `${dash} ${gap}`;
          const dashOffset = -offset;
          offset += dash + 2;
          return (
            <circle
              key={s.key}
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text x="60" y="58" textAnchor="middle" className="live-dash__donut-num">142</text>
        <text x="60" y="74" textAnchor="middle" className="live-dash__donut-label">eventos · 24h</text>
      </svg>
      <ul className="live-dash__donut-legend">
        {SEVERITY_DIST.map((s) => (
          <li key={s.key}>
            <span className="live-dash__donut-dot" style={{ background: s.color }} />
            <span className="live-dash__donut-key">{s.key}</span>
            <span className="live-dash__donut-pct">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Main dashboard ─────────────────────────────────────── */
export function LiveDashboard(): JSX.Element {
  const [points, setPoints] = useState<number[]>(seedRoas);
  const [events, setEvents] = useState<EventItem[]>(seedEvents);
  const [savedRevenue, setSavedRevenue] = useState<number>(2847);
  const [takedowns, setTakedowns] = useState<number>(8);
  const [pauses, setPauses] = useState<number>(4);
  const eventIdRef = useRef<number>(1000);

  /* ROAS ticker */
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let paused = false;
    const id = window.setInterval(() => {
      if (paused) return;
      setPoints((prev) => {
        const last = prev[prev.length - 1] ?? 0.5;
        return [...prev.slice(1), nextRoas(last)];
      });
      setSavedRevenue((v) => v + Math.round(Math.random() * 45));
    }, TICK_MS);
    const onVis = (): void => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  /* Event stream */
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let paused = false;
    const id = window.setInterval(() => {
      if (paused) return;
      const t = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)]!;
      const time = formatTimeNow();
      setEvents((prev) => {
        const detection: EventItem = {
          id: eventIdRef.current++,
          time,
          kind: 'detection',
          severity: t.severity,
          message: t.detection,
        };
        const action: EventItem = {
          id: eventIdRef.current++,
          time,
          kind: 'action',
          message: `${t.action} · ${t.responseMs}ms`,
          detail: 'attempt 1 · 200 OK',
        };
        return [detection, action, ...prev].slice(0, 10);
      });
      if (t.action.toLowerCase().includes('paus')) {
        setPauses((p) => p + 1);
      } else {
        setTakedowns((p) => p + 1);
        setSavedRevenue((v) => v + 200 + Math.floor(Math.random() * 800));
      }
    }, EVENT_EVERY_MS);
    const onVis = (): void => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const linePath = useMemo(() => smoothPath(points), [points]);
  const area = useMemo(() => areaPath(linePath), [linePath]);
  const head = useMemo(() => {
    const innerW = CHART_W - PAD_L - PAD_R;
    const innerH = CHART_H - PAD_T - PAD_B;
    const step = innerW / (points.length - 1);
    const x = PAD_L + (points.length - 1) * step;
    const v = points[points.length - 1] ?? 0;
    const y = PAD_T + (1 - v) * innerH;
    return { x, y };
  }, [points]);

  const sparkPath = useMemo(() => sparklinePath(points.slice(-12), 60, 22), [points]);
  const currentRoas = useMemo(() => 1 + (points[points.length - 1] ?? 0) * 4, [points]);
  const firstRoas = useMemo(() => 1 + (points[0] ?? 0) * 4, [points]);
  const deltaPct = ((currentRoas - firstRoas) / Math.max(firstRoas, 0.01)) * 100;
  const activeAds = 43;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndexes = [0, Math.floor(N_POINTS * 0.25), Math.floor(N_POINTS * 0.5), Math.floor(N_POINTS * 0.75), N_POINTS - 1];

  return (
    <article className="live-dash" aria-label="Painel ao vivo de cliente FURY">
      {/* HEADER */}
      <header className="live-dash__head">
        <div className="live-dash__client">
          <span className="live-dash__client-logo">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M12 2L3 6v6c0 5.5 3.7 10.4 9 12 5.3-1.6 9-6.5 9-12V6l-9-4z" fill="rgba(255,61,46,0.15)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M8.5 12.5 11 15l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div>
            <div className="live-dash__client-name">{CLIENT.name}</div>
            <div className="live-dash__client-meta">
              <span className="live-dash__tier">{CLIENT.tier}</span>
              <span>·</span>
              <span>{CLIENT.platform}</span>
              <span>·</span>
              <span>{CLIENT.totalAds} campanhas</span>
            </div>
          </div>
        </div>
        <div className="live-dash__live-badge">
          <span className="live-dash__live-dot" />
          AO VIVO
        </div>
      </header>

      {/* STAT CARDS */}
      <div className="live-dash__stats">
        <div className="live-dash__stat">
          <div className="live-dash__stat-label">ROAS atual</div>
          <div className="live-dash__stat-value gradient-text">{currentRoas.toFixed(2)}x</div>
          <svg className="live-dash__spark" viewBox="0 0 60 22" preserveAspectRatio="none" aria-hidden="true">
            <path d={sparkPath} fill="none" stroke="url(#dash-spark-grad)" strokeWidth="1.6" strokeLinecap="round" />
            <defs>
              <linearGradient id="dash-spark-grad" x1="0" x2="1">
                <stop offset="0%"  stopColor="#ff3d2e"/>
                <stop offset="100%" stopColor="#ffd166"/>
              </linearGradient>
            </defs>
          </svg>
          <div className={`live-dash__stat-delta ${deltaPct >= 0 ? 'is-up' : 'is-down'}`}>
            {deltaPct >= 0 ? '↗' : '↘'} {Math.abs(deltaPct).toFixed(1)}%
          </div>
        </div>

        <div className="live-dash__stat">
          <div className="live-dash__stat-label">Anúncios ativos</div>
          <div className="live-dash__stat-value">
            {activeAds}
            <span className="live-dash__stat-of">/ {CLIENT.totalAds}</span>
          </div>
          <div className="live-dash__progress" aria-hidden="true">
            <div className="live-dash__progress-fill" style={{ width: `${(activeAds / CLIENT.totalAds) * 100}%` }} />
          </div>
          <div className="live-dash__stat-detail">{CLIENT.totalAds - activeAds} pausados pelo FURY</div>
        </div>

        <div className="live-dash__stat">
          <div className="live-dash__stat-label">Ações nas últimas 24h</div>
          <div className="live-dash__stat-value">
            <span className="live-dash__stat-num">{takedowns + pauses}</span>
          </div>
          <div className="live-dash__action-split">
            <span className="live-dash__action-tag live-dash__action-tag--down">{takedowns} takedowns</span>
            <span className="live-dash__action-tag live-dash__action-tag--pause">{pauses} pausas</span>
          </div>
        </div>

        <div className="live-dash__stat live-dash__stat--accent">
          <div className="live-dash__stat-label">Receita protegida hoje</div>
          <div className="live-dash__stat-value gradient-text">
            R$ {savedRevenue.toLocaleString('pt-BR')}
          </div>
          <div className="live-dash__stat-detail">de R$ 200k/mês investidos</div>
        </div>
      </div>

      {/* MAIN CHART */}
      <div className="live-dash__chart-wrap">
        <div className="live-dash__chart-head">
          <h4 className="live-dash__chart-title">ROAS · últimas {N_POINTS} medições</h4>
          <div className="live-dash__chart-legend">
            <span className="live-dash__chart-legend-item">
              <span className="live-dash__chart-legend-line" /> ROAS
            </span>
            <span className="live-dash__chart-legend-item">
              <span className="live-dash__chart-legend-thresh" /> Meta 2.5x
            </span>
          </div>
        </div>
        <svg
          className="live-dash__svg"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Gráfico de evolução de ROAS"
        >
          <defs>
            <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#ff7a18" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#ff3d2e" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ff3d2e" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="dash-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stopColor="#ff3d2e" />
              <stop offset="60%" stopColor="#ff7a18" />
              <stop offset="100%" stopColor="#ffd166" />
            </linearGradient>
            <filter id="dash-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>

          {/* Y axis grid + labels */}
          {yTicks.map((t) => {
            const y = PAD_T + (1 - t) * (CHART_H - PAD_T - PAD_B);
            return (
              <g key={t}>
                <line x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                <text x={PAD_L - 8} y={y + 3} textAnchor="end" className="live-dash__svg-tick">
                  {(1 + t * 4).toFixed(1)}x
                </text>
              </g>
            );
          })}

          {/* Threshold line (2.5x ≈ value 0.375) */}
          {(() => {
            const y = PAD_T + (1 - 0.375) * (CHART_H - PAD_T - PAD_B);
            return (
              <g>
                <line x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y}
                  stroke="rgba(255,209,102,0.45)" strokeWidth="1" strokeDasharray="3 4" />
                <text x={CHART_W - PAD_R - 4} y={y - 5} textAnchor="end" className="live-dash__svg-thresh">meta 2.5x</text>
              </g>
            );
          })()}

          {/* X axis labels */}
          {xTickIndexes.map((i) => {
            const innerW = CHART_W - PAD_L - PAD_R;
            const step = innerW / (N_POINTS - 1);
            const x = PAD_L + i * step;
            const minsAgo = (N_POINTS - 1 - i) * Math.round(TICK_MS / 1000);
            const label = minsAgo === 0 ? 'agora' : `-${minsAgo}s`;
            return (
              <text key={i} x={x} y={CHART_H - PAD_B + 14} textAnchor="middle" className="live-dash__svg-tick">
                {label}
              </text>
            );
          })}

          {/* Area + line */}
          <path d={area} fill="url(#dash-area)" style={{ transition: 'd 1.2s linear' }} />
          <path d={linePath} fill="none" stroke="url(#dash-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" filter="url(#dash-glow)" style={{ transition: 'd 1.2s linear' }} />
          <path d={linePath} fill="none" stroke="url(#dash-line)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 1.2s linear' }} />

          {/* Leading dot */}
          <circle cx={head.x} cy={head.y} r="4" fill="#ffd166" style={{ transition: 'cx 1.2s linear, cy 1.2s linear' }}>
            <animate attributeName="r" values="4;6.5;4" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={head.x} cy={head.y} r="2.2" fill="#fff8e1" style={{ transition: 'cx 1.2s linear, cy 1.2s linear' }} />
        </svg>
      </div>

      {/* BOTTOM ROW: events log + severity donut */}
      <div className="live-dash__bottom">
        <div className="live-dash__events">
          <div className="live-dash__events-head">
            <h4 className="live-dash__chart-title">Eventos em tempo real</h4>
            <span className="mono live-dash__events-count">{events.length} eventos</span>
          </div>
          <ol className="live-dash__events-list mono">
            {events.map((ev) => (
              <li
                key={ev.id}
                className={`live-dash__event live-dash__event--${ev.kind}`}
                data-sev={ev.severity ?? ''}
              >
                <span className="live-dash__event-time">{ev.time}</span>
                {ev.kind === 'detection' && ev.severity && (
                  <span className={`live-dash__sev live-dash__sev--${ev.severity.toLowerCase()}`}>
                    {ev.severity}
                  </span>
                )}
                {ev.kind === 'action' && (
                  <span className="live-dash__event-tag live-dash__event-tag--ok">✓</span>
                )}
                <span className="live-dash__event-msg">{ev.message}</span>
                {ev.detail && <span className="live-dash__event-detail">· {ev.detail}</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="live-dash__severity">
          <div className="live-dash__events-head">
            <h4 className="live-dash__chart-title">Severidade · 24h</h4>
          </div>
          <SeverityDonut />
        </div>
      </div>
    </article>
  );
}
