import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap, prefersReducedMotion } from '../../lib/gsap';
import { useAuth } from '../../hooks/useAuth';

const NAV_LINKS = [
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Resultados', href: '#resultados' },
  { label: 'Avaliações', href: '#avaliacoes' },
  { label: 'Integrações', href: '#integracoes' },
] as const;

export function Header(): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, user } = useAuth();

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.from(ref.current, {
        y: -64, opacity: 0, duration: 0.75, ease: 'expo.out',
      });
    }, ref);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header ref={ref} className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container site-header__row">
        <Link to="/" className="brand" aria-label="FURY — início">
          <span className="brand__icon-wrap" aria-hidden="true">
            <img
              src="/icon.webp"
              alt=""
              className="brand__icon"
              width={48}
              height={48}
            />
            <span className="brand__icon-glow" />
          </span>
          <img
            src="/furytittle.webp"
            alt="FURY"
            className="brand__wordmark"
            width={483}
            height={122}
          />
        </Link>

        <nav className="site-nav" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="site-nav__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="site-header__cta">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn btn--primary btn--sm">
              {`Olá, ${(user?.name ?? '').split(' ')[0] || 'gestor'}`}
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn--ghost btn--sm">Entrar</Link>
              <Link to="/register" className="btn btn--primary btn--sm">
                Acender
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
