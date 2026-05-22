import { useEffect, useState } from 'react';
import { Sidebar } from '../components/dashboard/Sidebar';
import { LiveDashboard } from '../components/sections/LiveDashboard';
import { useAuth } from '../hooks/useAuth';

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const first = name.trim().split(/\s+/)[0] ?? 'gestor';
  if (hour < 6) return `Boa madrugada, ${first}`;
  if (hour < 12) return `Bom dia, ${first}`;
  if (hour < 18) return `Boa tarde, ${first}`;
  return `Boa noite, ${first}`;
}

const QUICK_STATS: Array<{ label: string; value: string; delta: string; positive: boolean }> = [
  { label: 'Anúncios ativos',        value: '43',        delta: '+2 hoje',    positive: true  },
  { label: 'ROAS médio (24h)',       value: '3.42x',     delta: '+18.4%',     positive: true  },
  { label: 'Ações executadas',       value: '12',        delta: 'em 24h',     positive: true  },
  { label: 'Receita protegida hoje', value: 'R$ 2.847',  delta: '+R$ 412/h',  positive: true  },
];

export default function DashboardPage(): JSX.Element {
  const { user } = useAuth();
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
          {QUICK_STATS.map((s) => (
            <article key={s.label} className="dash-quick__card">
              <div className="dash-quick__label">{s.label}</div>
              <div className="dash-quick__value gradient-text">{s.value}</div>
              <div className={`dash-quick__delta ${s.positive ? 'is-up' : 'is-down'}`}>
                {s.positive ? '↗' : '↘'} {s.delta}
              </div>
            </article>
          ))}
        </section>

        <section className="dash-live">
          <LiveDashboard />
        </section>

        <section className="dash-side-grid">
          <article className="dash-card">
            <header className="dash-card__head">
              <h3 className="dash-card__title">Conexões ativas</h3>
              <span className="mono dim">3 plataformas</span>
            </header>
            <ul className="dash-conn">
              <li className="dash-conn__item">
                <span className="dash-conn__mark" style={{ background: '#0064E0' }}>M</span>
                <div className="dash-conn__info">
                  <div className="dash-conn__name">Meta Ads</div>
                  <div className="dash-conn__meta mono">47 campanhas · 12 ad sets</div>
                </div>
                <span className="dash-conn__status is-on">online</span>
              </li>
              <li className="dash-conn__item">
                <span className="dash-conn__mark" style={{ background: '#4285F4' }}>G</span>
                <div className="dash-conn__info">
                  <div className="dash-conn__name">Google Ads</div>
                  <div className="dash-conn__meta mono">22 campanhas · 8 grupos</div>
                </div>
                <span className="dash-conn__status is-on">online</span>
              </li>
              <li className="dash-conn__item">
                <span className="dash-conn__mark" style={{ background: '#000' }}>T</span>
                <div className="dash-conn__info">
                  <div className="dash-conn__name">TikTok Ads</div>
                  <div className="dash-conn__meta mono">14 campanhas · 6 grupos</div>
                </div>
                <span className="dash-conn__status is-on">online</span>
              </li>
            </ul>
          </article>

          <article className="dash-card">
            <header className="dash-card__head">
              <h3 className="dash-card__title">Próximas ações sugeridas</h3>
              <span className="mono dim">FURY recomenda</span>
            </header>
            <ul className="dash-todo">
              <li className="dash-todo__item">
                <span className="dash-todo__bullet" style={{ background: '#ff7a18' }} />
                <span>Revisar criativos da campanha "Black Friday" — 3 alertas de brand safety</span>
              </li>
              <li className="dash-todo__item">
                <span className="dash-todo__bullet" style={{ background: '#f5b942' }} />
                <span>Aumentar threshold de severidade em "Promoção Verão" (muito sensível)</span>
              </li>
              <li className="dash-todo__item">
                <span className="dash-todo__bullet" style={{ background: '#2bd279' }} />
                <span>Conectar conta do TikTok Business secundária</span>
              </li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
