import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { apiClient } from '../api/client';
import { AccountProvider } from './AccountContext';
import { sessionQueryKey } from './session';
import { useAccount } from './useAccount';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>{children}</AccountProvider>
    </QueryClientProvider>
  );
}

function strictWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AccountProvider>{children}</AccountProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

describe('useAccount', () => {
  it('throws when used outside AccountProvider', () => {
    expect(() => renderHook(() => useAccount())).toThrow();
  });

  it('starts with isLoading true, then settles to a logged-out state when there is no session', async () => {
    const { result } = renderHook(() => useAccount(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('restores a session on mount when the refresh cookie is valid', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );

    const { result } = renderHook(() => useAccount(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      emailVerified: true,
      memberships: [],
    });
  });

  it('keeps the session when the API is briefly unavailable on reload (regression: logout on refresh)', async () => {
    let refreshCalls = 0;
    server.use(
      http.post('/api/auth/refresh', () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? new HttpResponse(null, { status: 502 })
          : HttpResponse.json({ accessToken: 'restored-token' });
      }),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );

    const { result } = renderHook(() => useAccount(), { wrapper });

    await waitFor(() => expect(result.current.user?.id).toBe('user-1'), { timeout: 3000 });
    expect(refreshCalls).toBe(2);
  });

  it('restores the session exactly once under React.StrictMode double-invoked mount effects (regression: single-use refresh token race)', async () => {
    // Simulates the backend's single-use rotating refresh token: the first
    // call succeeds and rotates the token, any subsequent call (e.g. a
    // second, duplicate query observer mount reusing the now-stale cookie)
    // gets a 401, exactly like the real server does. TanStack Query dedupes
    // concurrent fetches for the same queryKey, so StrictMode's mount ->
    // cleanup -> mount double-invoke must NOT fire this handler twice.
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
        HttpResponse.json({
          id: 'user-1',
          email: 'strict@b.com',
          emailVerified: true,
          memberships: [],
        }),
      ),
    );

    const { result } = renderHook(() => useAccount(), { wrapper: strictWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({
      id: 'user-1',
      email: 'strict@b.com',
      emailVerified: true,
      memberships: [],
    });
    expect(refreshCallCount).toBe(1);
  });

  it('drops every cached query but the session when the session expires mid-use', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );
    const { result } = renderHook(() => useAccount(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AccountProvider>{children}</AccountProvider>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.user?.id).toBe('user-1'));
    queryClient.setQueryData(['me', 'teams'], [{ id: 'team-of-user-1' }]);

    server.use(
      http.get('/api/whoami', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    );
    await act(async () => {
      await apiClient.get('/whoami').catch(() => undefined);
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(queryClient.getQueryData(['me', 'teams'])).toBeUndefined();
    expect(queryClient.getQueryState(sessionQueryKey)?.data).toBeNull();
  });

  describe('when the restore keeps failing', () => {
    // The real delays add up to ~11 s; collapse the restore's own back-offs.
    const realSetTimeout = globalThis.setTimeout;
    const skipBackoff = () =>
      vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
          realSetTimeout(
            fn,
            ms !== undefined && [500, 1500, 3000, 6000].includes(ms) ? 0 : ms,
            ...args,
          )) as never);
    afterEach(() => vi.restoreAllMocks());

    it('reports an error, not a logged-out user, and drops the token it rotated', async () => {
      skipBackoff();
      server.use(
        http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'rotated' })),
        http.get('/api/auth/me', () => new HttpResponse(null, { status: 503 })),
      );

      const { result } = renderHook(() => useAccount(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
      expect(result.current.user).toBeNull();
      server.use(
        http.get('/api/ping', ({ request }) =>
          HttpResponse.json({ authorization: request.headers.get('authorization') }),
        ),
      );
      await expect(apiClient.get('/ping')).resolves.toEqual({ authorization: null });
    });

    it('retries a proxy 429 rather than reading it as "no session"', async () => {
      skipBackoff();
      let calls = 0;
      server.use(
        http.post('/api/auth/refresh', () => {
          calls += 1;
          return calls === 1
            ? new HttpResponse(null, { status: 429 })
            : HttpResponse.json({ accessToken: 'restored-token' });
        }),
        http.get('/api/auth/me', () =>
          HttpResponse.json({ id: 'u1', email: 'a@b.com', emailVerified: true, memberships: [] }),
        ),
      );

      const { result } = renderHook(() => useAccount(), { wrapper });

      await waitFor(() => expect(result.current.user?.id).toBe('u1'), { timeout: 2500 });
      expect(result.current.isError).toBe(false);
    });

    it('retry() runs the restore again', async () => {
      skipBackoff();
      let failing = true;
      server.use(
        http.post('/api/auth/refresh', () =>
          failing
            ? new HttpResponse(null, { status: 502 })
            : HttpResponse.json({ accessToken: 't' }),
        ),
        http.get('/api/auth/me', () =>
          HttpResponse.json({ id: 'u1', email: 'a@b.com', emailVerified: true, memberships: [] }),
        ),
      );

      const { result } = renderHook(() => useAccount(), { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });

      failing = false;
      result.current.retry();

      await waitFor(() => expect(result.current.user?.id).toBe('u1'), { timeout: 2500 });
    });
  });
});
