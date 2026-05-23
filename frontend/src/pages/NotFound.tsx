import { Link } from 'react-router-dom';
import type { JSX } from 'react';
import './NotFound.css';

/**
 * Página 404 branded. Catch-all no React Router (path="*"). Cloudflare Pages
 * serve dist/404.html (cópia de index.html) → React Router boota → essa
 * rota renderiza.
 */

export default function NotFoundPage(): JSX.Element {
  return (
    <main className="nf">
      <div className="nf__bg" aria-hidden="true">
        <span className="nf__bg-orb nf__bg-orb--red" />
        <span className="nf__bg-orb nf__bg-orb--hot" />
      </div>
      <div className="nf__inner">
        <div className="nf__num gradient-text">404</div>
        <h1 className="nf__title">Rota não existe</h1>
        <p className="nf__sub">
          Essa página foi removida, nunca existiu, ou você digitou errado.
          Sem drama — escolhe pra onde quer ir:
        </p>
        <div className="nf__actions">
          <Link to="/" className="nf__btn nf__btn--primary">Landing</Link>
          <Link to="/dashboard" className="nf__btn">Dashboard</Link>
          <Link to="/login" className="nf__btn">Login</Link>
        </div>
        <p className="nf__hint mono">
          se você acessou via link → me reporta:
          <a
            href="https://github.com/MathSchumacher/FURY-Click-Hero-Desafio-T-cnico/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            github issues
          </a>
        </p>
      </div>
    </main>
  );
}
