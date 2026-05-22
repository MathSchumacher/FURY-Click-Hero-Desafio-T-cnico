import { useEffect, useState, type SVGProps } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type IconProps = SVGProps<SVGSVGElement>;

/* ── Inline icons (no external dep) ───────────────────── */
const I = {
  chevronLeft:  (p: IconProps) => <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path d="M10 4l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevronRight: (p: IconProps) => <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus:         (p: IconProps) => <svg viewBox="0 0 16 16" width="16" height="16" {...p}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  home:         (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M2 8l7-6 7 6v8a1 1 0 01-1 1h-4v-5H7v5H3a1 1 0 01-1-1V8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  flame:        (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M9 1.5c.5 3.5 4 5 4 8a4 4 0 11-8 0c0-1.5 1-3 2-4 .5 1 1 1.5 1.5 1.5C8.5 5 9 3 9 1.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  shield:       (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M9 1.5L2.5 4v5c0 4 2.7 7.5 6.5 8.5 3.8-1 6.5-4.5 6.5-8.5V4L9 1.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M6.5 9L8 10.5 11.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bell:         (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M9 2v1m0 0a5 5 0 015 5v3l1 2H3l1-2V8a5 5 0 015-5zM7 14a2 2 0 004 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  link:         (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M7 11l4-4M5 9a3 3 0 014.2 0L11 10.8m-3 .2a3 3 0 01-4.2 0 3 3 0 010-4.2L5.5 5M10 13a3 3 0 004.2 0 3 3 0 000-4.2L12.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  settings:     (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><circle cx="9" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M14.5 9a5.5 5.5 0 00-.1-1l1.4-1.1-1.5-2.5L12.6 5a5.5 5.5 0 00-1.7-1L10.5 2.3h-3L7.1 4a5.5 5.5 0 00-1.7 1L3.7 4.4 2.2 6.9 3.6 8a5.5 5.5 0 000 2L2.2 11.1 3.7 13.6 5.4 13a5.5 5.5 0 001.7 1l.4 1.7h3l.4-1.7a5.5 5.5 0 001.7-1l1.7.6 1.5-2.5L14.4 10c.06-.33.1-.66.1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  team:         (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><circle cx="6.5" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="6.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M2 14c.5-2.2 2.4-3.5 4.5-3.5S11 11.8 11.5 14M12 10.5c1.8 0 3.5 1 4 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  logout:       (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><path d="M7 3H4a1 1 0 00-1 1v10a1 1 0 001 1h3M11 5l3 4-3 4M14 9H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bot:          (p: IconProps) => <svg viewBox="0 0 18 18" width="18" height="18" {...p}><rect x="3" y="6" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M9 3v3M6 10v.5M12 10v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="3" r="1" fill="currentColor"/></svg>,
} as const;

type NavItem = {
  id: string;
  label: string;
  icon: keyof typeof I;
  to: string;
  count?: number;
  soon?: boolean;
};

const NAV_PRIMARY: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'home', to: '/dashboard' },
  { id: 'events', label: 'Eventos', icon: 'flame', to: '/dashboard/events', soon: true },
  { id: 'protection', label: 'Proteção', icon: 'shield', to: '/dashboard/protection', soon: true },
  { id: 'alerts', label: 'Alertas', icon: 'bell', to: '/dashboard/alerts', soon: true },
];

const NAV_SECONDARY: NavItem[] = [
  {
    id: 'integrations',
    label: 'Integrações',
    icon: 'link',
    to: '/dashboard/integrations',
    soon: true,
  },
  { id: 'team', label: 'Equipe', icon: 'team', to: '/dashboard/team', soon: true },
];

type Provider = { id: string; label: string; bg: string; mark: string };
const PROVIDERS: Provider[] = [
  { id: 'meta',   label: 'Meta Ads',   bg: '#0064E0', mark: 'M' },
  { id: 'google', label: 'Google Ads', bg: '#4285F4', mark: 'G' },
  { id: 'tiktok', label: 'TikTok Ads', bg: '#000000', mark: 'T' },
];

export function Sidebar(): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('fury_sidebar_collapsed') === 'true'
  );
  const [providerMenu, setProviderMenu] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    try { localStorage.setItem('fury_sidebar_collapsed', String(collapsed)); } catch { /* noop */ }
  }, [collapsed]);

  const initials = user?.name
    ? user.name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
    : 'F';

  const role = user?.email?.endsWith('@fury.dev') ? 'Administrador' : 'Gestor de tráfego';

  function isActive(to: string): boolean {
    if (to === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(to);
  }

  function NavLink({ item }: { item: NavItem }): JSX.Element {
    const Icon = I[item.icon];
    /* Itens "soon" não navegam — botão estilizado igual mas inativo. */
    if (item.soon) {
      return (
        <button
          type="button"
          className="fury-side__item fury-side__item--soon"
          title={collapsed ? `${item.label} (em breve)` : 'Em breve'}
          aria-disabled="true"
        >
          <Icon className="fury-side__icon" />
          <span className="fury-side__label">{item.label}</span>
          <span className="fury-side__soon-pill">em breve</span>
        </button>
      );
    }
    return (
      <Link
        to={item.to}
        className={`fury-side__item ${isActive(item.to) ? 'is-active' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="fury-side__icon" />
        <span className="fury-side__label">{item.label}</span>
        {typeof item.count === 'number' && (
          <span className="fury-side__count">{item.count}</span>
        )}
      </Link>
    );
  }

  function handleLogout(): void {
    logout();
    nav('/login');
  }

  return (
    <aside className={`fury-side ${collapsed ? 'is-collapsed' : ''}`} aria-label="Navegação principal">
      <button
        type="button"
        className="fury-side__toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
      >
        {collapsed ? <I.chevronRight /> : <I.chevronLeft />}
      </button>

      {/* HEADER: brand */}
      <div className="fury-side__brand">
        <span className="fury-side__brand-icon-wrap" aria-hidden="true">
          <img src="/icon.webp" alt="" width={36} height={36} className="fury-side__brand-icon" />
          <span className="fury-side__brand-glow" />
        </span>
        <img
          src="/furytittle.webp"
          alt="FURY"
          width={483}
          height={122}
          className="fury-side__brand-wordmark"
        />
      </div>

      {/* COMPOSE: CTA pra conectar plataforma — OAuth Meta/Google/TikTok ainda
          não está implementado, então mostra como "em breve" pra ser honesto. */}
      <div className={`fury-side__compose-wrap ${collapsed ? 'is-collapsed' : ''}`}>
        <button
          type="button"
          className={`fury-side__compose fury-side__compose--soon ${collapsed ? 'is-collapsed' : ''}`}
          onClick={() => setProviderMenu((v) => !v)}
          aria-expanded={providerMenu}
          title="OAuth com Meta/Google/TikTok — em breve"
        >
          <I.plus className="fury-side__icon" />
          <span className="fury-side__compose-label">Conectar plataforma</span>
          <span className="fury-side__soon-pill fury-side__soon-pill--compose">em breve</span>
        </button>
        {providerMenu && !collapsed && (
          <div className="fury-side__provider-menu" role="menu">
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button" className="fury-side__provider" role="menuitem">
                <span className="fury-side__provider-mark" style={{ background: p.bg }}>
                  {p.mark}
                </span>
                {p.label}
                <span className="fury-side__soon-pill">em breve</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* NAV */}
      <nav className="fury-side__nav">
        <div className="fury-side__nav-label">Painel</div>
        {NAV_PRIMARY.map((item) => <NavLink key={item.id} item={item} />)}

        <div className="fury-side__nav-label fury-side__nav-label--gap">Gerenciar</div>
        {NAV_SECONDARY.map((item) => <NavLink key={item.id} item={item} />)}
      </nav>

      {/* FOOTER */}
      <div className="fury-side__footer">
        <div className="fury-side__user" title={collapsed ? user?.name : undefined}>
          <span className="fury-side__user-avatar">{initials}</span>
          <div className="fury-side__user-info">
            <div className="fury-side__user-name">{user?.name ?? 'Usuário'}</div>
            <div className="fury-side__user-role">{role}</div>
          </div>
        </div>

        <div className="fury-side__footer-btns">
          <button
            type="button"
            className="fury-side__icon-btn fury-side__icon-btn--soon"
            title="Assistente FURY (em breve)"
            aria-disabled="true"
          >
            <I.bot className="fury-side__icon" />
          </button>
          <button
            type="button"
            className="fury-side__icon-btn fury-side__icon-btn--optional fury-side__icon-btn--soon"
            title="Configurações (em breve)"
            aria-disabled="true"
          >
            <I.settings className="fury-side__icon" />
          </button>
          <button
            type="button"
            className="fury-side__icon-btn fury-side__icon-btn--logout"
            title="Sair"
            onClick={handleLogout}
          >
            <I.logout className="fury-side__icon" />
          </button>
        </div>
      </div>
    </aside>
  );
}
