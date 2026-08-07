import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AccessTokenResponse, AuthUser, RefreshResponse } from '@basketeasy/types/auth';
import { apiClient, setAccessToken, subscribeToSessionExpiry } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
        setAccessToken(refreshResponse.accessToken);
        const me = await apiClient.get<AuthUser>('/auth/me');
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        // No valid session to restore — this is the normal state for a
        // first-time visitor, not an error to surface.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

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

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
