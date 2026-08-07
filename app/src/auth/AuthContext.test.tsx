import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider, useAuth, __resetSessionRestoreForTests } from './AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function strictWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <AuthProvider>{children}</AuthProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  // The session-restore promise is a module-level singleton by design (see
  // AuthContext.tsx) so StrictMode's double-invoked mount effect dedupes
  // onto a single /auth/refresh call. That means it must be reset between
  // tests, otherwise a later test's AuthProvider mount would reuse an
  // earlier test's cached restore result instead of hitting its own MSW
  // handlers.
  __resetSessionRestoreForTests();
});

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow();
  });

  it('starts with isLoading true, then settles to a logged-out state when there is no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('restores a session on mount when the refresh cookie is valid', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });

  it('restores the session exactly once under React.StrictMode double-invoked mount effects (regression: single-use refresh token race)', async () => {
    // Simulates the backend's single-use rotating refresh token: the first
    // call succeeds and rotates the token, any subsequent call (e.g. a
    // second, duplicate effect invocation reusing the now-stale cookie)
    // gets a 401, exactly like the real server does. Without the
    // module-level restoreSessionOnce() dedup, StrictMode's mount ->
    // cleanup -> mount double-invoke fires this handler twice, the second
    // call 401s, and the restored session is discarded (user stays null).
    let refreshCallCount = 0;
    server.use(
      http.post('/api/auth/refresh', () => {
        refreshCallCount += 1;
        if (refreshCallCount === 1) {
          return HttpResponse.json({ accessToken: 'restored-token' });
        }
        return HttpResponse.json({ message: 'Invalid refresh token' }, { status: 401 });
      }),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'strict@b.com', memberships: [] }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: strictWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({ id: 'user-1', email: 'strict@b.com', memberships: [] });
    expect(refreshCallCount).toBe(1);
  });

  it('login sets the user on success', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('a@b.com', 'password123');
    });

    expect(result.current.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });

  it('login throws and leaves the user null on failure', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.login('a@b.com', 'wrong')).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
  });

  it('register sets the user on success', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'new@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register('new@b.com', 'password123');
    });

    expect(result.current.user).toEqual({ id: 'user-1', email: 'new@b.com', memberships: [] });
  });

  it('register throws and leaves the user null on a duplicate email', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.register('a@b.com', 'password123')).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
  });

  it('logout clears the user even when the network call fails', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
      http.post('/api/auth/logout', () => HttpResponse.json({ message: 'error' }, { status: 500 })),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('a@b.com', 'password123');
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });
});
