import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  children: ReactNode;
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ children, eyebrow, title, subtitle, footer }: Props): JSX.Element {
  return (
    <main className="auth">
      {/* ── Left: brand + atmospheric visual ───────── */}
      <aside className="auth__visual" aria-hidden="true">
        <video
          className="auth__video"
          src="/background1dark.loop.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="auth__visual-overlay" />
        <div className="auth__visual-grid" />
        <div className="auth__visual-orb" />

        <div className="auth__visual-content">
          <Link to="/" className="auth__back" aria-label="Voltar para a home">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            voltar
          </Link>

          <div className="auth__visual-brand">
            <img src="/icon.webp" alt="" className="auth__brand-icon" width={68} height={68} />
            <img src="/furytittle.webp" alt="FURY" className="auth__brand-wordmark" width={483} height={122} />
          </div>

          <blockquote className="auth__quote">
            <span className="auth__quote-text">
              "Em três meses de FURY, salvou 4 contas que eu não conseguiria salvar
              sozinho. Pra mim, pagou um ano em uma semana."
            </span>
            <footer className="auth__quote-author">
              <span className="auth__quote-name">Rafael M.</span>
              <span className="auth__quote-role">Gestor de tráfego · agência</span>
            </footer>
          </blockquote>

          <ul className="auth__chips">
            <li>✓ Vigilância 24/7</li>
            <li>✓ Reação em ms</li>
            <li>✓ Conta protegida</li>
          </ul>
        </div>
      </aside>

      {/* ── Right: form panel ──────────────────────── */}
      <section className="auth__panel">
        <Link to="/" className="auth__back auth__back--mobile" aria-label="Voltar para a home">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          voltar
        </Link>

        <div className="auth__panel-inner">
          <header className="auth__head">
            <span className="eyebrow auth__eyebrow">{eyebrow}</span>
            <h1 className="auth__title">{title}</h1>
            <p className="auth__subtitle">{subtitle}</p>
          </header>
          {children}
          {footer && <div className="auth__footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
