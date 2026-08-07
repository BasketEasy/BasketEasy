import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { AccessTokenResponse, AuthUser } from '@basketeasy/types/auth';
import { apiClient, setAccessToken, subscribeToSessionExpiry } from '../api/client';
import { AuthContext } from './context';
import { restoreSessionOnce } from './sessionRestore';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    restoreSessionOnce().then((me) => {
      if (!cancelled) {
        setUser(me);
        setIsLoading(false);
      }
    });

    const unsubscribe = subscribeToSessionExpiry(() => {
      if (!cancelled) {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<AccessTokenResponse>('/auth/login', { email, password });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<AccessTokenResponse>('/auth/register', {
      email,
      password,
    });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Logout should always clear local session state, even if the
      // network call fails (e.g. the server is unreachable or the
      // refresh cookie is already invalid).
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
