import type { ReactNode, JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FuryLoader } from '../ui/FuryLoader/FuryLoader';

type Props = { children: ReactNode };

/**
 * Guard pra rotas autenticadas.
 *
 * IMPORTANTE: precisa esperar `loading` terminar antes de decidir, senão
 * race condition no mount: useAuth inicia com verified=false e roda
 * /auth/me em useEffect; se decidirmos logo no primeiro render, redireciona
 * pra /login antes do fetchMe completar (mata o componente, aborta a request).
 *
 * UX: FuryLoader fullscreen — primeiro frame que o user vê após login.
 */
export function ProtectedRoute({ children }: Props): JSX.Element {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FuryLoader label="validando sessão" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
