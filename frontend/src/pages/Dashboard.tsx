import { useEffect, useState } from 'react';
import { Sidebar } from '../components/dashboard/Sidebar';
import { SimulateViolationPanel } from '../components/dashboard/SimulateViolationPanel';
import { RecentViolationsPanel } from '../components/dashboard/RecentViolationsPanel';
import { SeverityDonut } from '../components/dashboard/SeverityDonut';
import { ConnectionsHealth } from '../components/dashboard/ConnectionsHealth';
import { useAuth } from '../hooks/useAuth';
import { useStats } from '../hooks/useBackendLive';

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const first = name.trim().split(/\s+/)[0] ?? 'gestor';
  if (hour < 6) return `Boa madrugada, ${first}`;
  if (hour < 12) return `Bom dia, ${first}`;
  if (hour < 18) return `Boa tarde, ${first}`;
  return `Boa noite, ${first}`;
}

type QuickStatCard = { label: string; value: string; delta: string; positive: boolean };

function buildQuickStats(stats: ReturnType<typeof useStats>['data']): QuickStatCard[] {
  if (!stats) {
    return [
      { label: 'Em processamento', value: '—',    delta: 'carregando…', positive: true },
      { label: 'Takedowns concluídos', value: '—', delta: 'carregando…', positive: true },
      { label: 'Total monitorado', value: '—',     delta: 'carregando…', positive: true },
      { label: 'Falhas (retries esgotados)', value: '—', delta: 'carregando…', positive: true },
    ];
  }
  const inFlight = stats.byStatus.queued + stats.byStatus.active;
  const criticalCount = stats.bySeverity.CRITICAL + stats.bySeverity.HIGH;
  return [
    {
      label: 'Em processamento',
      value: String(inFlight),
      delta: `${stats.byStatus.queued} aguardando · ${stats.byStatus.active} ativos`,
      positive: true,
    },
    {
      label: 'Takedowns concluídos',
      value: String(stats.byStatus.completed),
      delta: stats.byStatus.completed > 0 ? 'no histórico' : 'sem registros ainda',
      positive: true,
    },
    {
      label: 'Total monitorado',
      value: String(stats.total),
      delta: `${criticalCount} alta severidade`,
      positive: true,
    },
    {
      label: 'Falhas (retries esgotados)',
      value: String(stats.byStatus.failed),
      delta: stats.byStatus.failed === 0 ? 'tudo limpo' : 'requer atenção',
      positive: stats.byStatus.failed === 0,
    },
  ];
}

export default function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const { data: stats } = useStats(4000);
  const quickStats = buildQuickStats(stats);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('fury_sidebar_collapsed') === 'true',
  );

  /* Stay in sync with sidebar toggle (it writes to localStorage on each click) */
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = localStorage.getItem('fury_sidebar_collapsed') === 'true';
      setCollapsed((prev) => (prev !== v ? v : prev));
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const greeting = greetingFor(user?.name ?? 'gestor');

  return (
    <div className={`dash-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />

      <main className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar__crumb">
            <span className="mono">Overview</span>
            <span className="dash-topbar__sep">/</span>
            <span className="mono dim">tempo real</span>
          </div>
          <div className="dash-topbar__live">
            <span className="dash-topbar__live-dot" />
            todos os sistemas em chamas
          </div>
        </header>

        <section className="dash-greet">
          <h1 className="dash-greet__title">
            {greeting}. <span className="gradient-text">FURY está vigiando.</span>
          </h1>
          <p className="dash-greet__sub">
            Resumo das últimas 24 horas. Tudo que precisa da sua atenção está em destaque.
          </p>
        </section>

        <section className="dash-quick">
          {quickStats.map((s) => (
            <article key={s.label} className="dash-quick__card">
              <div className="dash-quick__label">{s.label}</div>
              <div className="dash-quick__value gradient-text">{s.value}</div>
              <div className={`dash-quick__delta ${s.positive ? 'is-up' : 'is-down'}`}>
                {s.positive ? '↗' : '↘'} {s.delta}
              </div>
            </article>
          ))}
        </section>

        <section className="dash-realtime">
          <SimulateViolationPanel />
          <RecentViolationsPanel />
        </section>

        <section className="dash-side-grid">
          <SeverityDonut />
          <ConnectionsHealth />
        </section>
      </main>
    </div>
  );
}
