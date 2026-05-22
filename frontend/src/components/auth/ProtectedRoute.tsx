import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type Props = { children: ReactNode };

/**
 * Guard pra rotas autenticadas.
 *
 * IMPORTANTE: precisa esperar `loading` terminar antes de decidir, senão
 * race condition no mount: useAuth inicia com verified=false e roda
 * /auth/me em useEffect; se decidirmos logo no primeiro render, redireciona
 * pra /login antes do fetchMe completar (mata o componente, aborta a request).
 *
 * UX: mostra splash mínimo de "validando sessão" durante o loading.
 */
export function ProtectedRoute({ children }: Props): JSX.Element {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--c-bg)',
          color: 'var(--c-text-dim)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span
            className="auth-form__spin"
            aria-hidden="true"
            style={{ width: 32, height: 32, borderWidth: 3, marginBottom: 12 }}
          />
          <p className="mono" style={{ fontSize: '0.85rem' }}>validando sessão…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
