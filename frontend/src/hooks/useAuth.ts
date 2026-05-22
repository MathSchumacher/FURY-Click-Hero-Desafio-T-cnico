import { useEffect, useState } from 'react';
import { fetchMe, getUser, logout as logoutLib, setSession, type AuthUser } from '../lib/auth';

/**
 * Hook de sessão.
 *
 * Sem token no JS: o cookie HttpOnly cuida da auth. Determinar "está
 * logado?" exige uma chamada a /auth/me — fazemos em mount com fallback
 * pro cache local (UX otimista: dashboard pisca antes da resposta).
 *
 * Estados:
 *   - loading: true durante o primeiro fetch ao /auth/me
 *   - user: do cache local (sync) ou do /auth/me (async, autoritativo)
 *   - isAuthenticated: true só quando /auth/me confirma sessão válida
 */
export function useAuth(): {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
} {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => {
        if (!alive) return;
        setUser(me);
        setSession(me); /* atualiza cache local */
        setVerified(true);
      })
      .catch(() => {
        if (!alive) return;
        /* 401/erro → sem sessão válida; limpa estado */
        setUser(null);
        setVerified(false);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    /* sync entre tabs via storage event */
    const sync = (): void => {
      const u = getUser();
      setUser(u);
      if (!u) setVerified(false);
    };
    window.addEventListener('storage', sync);
    return () => {
      alive = false;
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    user,
    loading,
    isAuthenticated: verified && !!user,
    logout: async (): Promise<void> => {
      await logoutLib();
      setUser(null);
      setVerified(false);
    },
  };
}
