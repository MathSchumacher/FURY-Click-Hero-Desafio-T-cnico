import { useEffect, useState } from 'react';
import { getToken, getUser, logout as logoutLib, type AuthUser } from '../lib/auth';

export function useAuth(): {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
} {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [token, setToken] = useState<string | null>(() => getToken());

  useEffect(() => {
    const sync = (): void => {
      setUser(getUser());
      setToken(getToken());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    logout: (): void => {
      logoutLib();
      setUser(null);
      setToken(null);
    },
  };
}
