import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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

// Module-level singleton so React.StrictMode's dev-mode double-invoke of
// the mount effect below (mount → cleanup → mount) doesn't fire the
// session-restore network calls twice. Both effect invocations await the
// SAME promise, so /auth/refresh is only ever called once per page load —
// which matters because the refresh token is single-use/rotating, so a
// second concurrent call would always fail with 401 and discard a valid
// session. Deliberately never reset back to null (unlike client.ts's own
// `refreshPromise`, which resets per-call to serve future 401s): this
// assumes AuthProvider mounts once per page load, which holds today since
// it wraps the whole app once in main.tsx with no routing. If a future
// routing change ever unmounts/remounts AuthProvider mid-session, this
// singleton would need to be reset (e.g. on unmount) or reconsidered.
let sessionRestorePromise: Promise<AuthUser | null> | null = null;

function restoreSessionOnce(): Promise<AuthUser | null> {
  if (!sessionRestorePromise) {
    sessionRestorePromise = (async () => {
      try {
        const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
        setAccessToken(refreshResponse.accessToken);
        return await apiClient.get<AuthUser>('/auth/me');
      } catch {
        // No valid session to restore — this is the normal state for a
        // first-time visitor, not an error to surface.
        return null;
      }
    })();
  }
  return sessionRestorePromise;
}

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

// Test-only escape hatch: resets the module-level session-restore singleton
// between test cases, since each test needs a fresh AuthProvider mount to
// actually hit its own MSW handlers instead of reusing the previous test's
// cached restore result. Not used by production code.
export function __resetSessionRestoreForTests(): void {
  sessionRestorePromise = null;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
