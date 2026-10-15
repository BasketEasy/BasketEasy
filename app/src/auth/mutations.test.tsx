import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import type { User } from '@basketeasy/types/auth';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { apiClient } from '../api/client';
import { AccountProvider } from './AccountContext';
import { useAccount } from './useAccount';
import { useLogin, useRegister, useLogout } from './mutations';
import { replaceSession, sessionQueryKey } from './session';

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>{children}</AccountProvider>
    </QueryClientProvider>
  );
}

function useHarness() {
  return {
    account: useAccount(),
    login: useLogin(),
    register: useRegister(),
    logout: useLogout(),
  };
}

describe('auth mutations', () => {
  it('login sets the session user in the query cache on success', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.account.isLoading).toBe(false));

    await act(async () => {
      await result.current.login.mutateAsync({ email: 'a@b.com', password: 'password123' });
    });

    await waitFor(() =>
      expect(result.current.account.user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        memberships: [],
      }),
    );
  });

  it('login rejects and leaves the user null on failure', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.account.isLoading).toBe(false));

    await act(async () => {
      await expect(
        result.current.login.mutateAsync({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow();
    });

    expect(result.current.account.user).toBeNull();
  });

  it('register sets the session user in the query cache on success', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'new@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.account.isLoading).toBe(false));

    await act(async () => {
      await result.current.register.mutateAsync({ email: 'new@b.com', password: 'password123' });
    });

    await waitFor(() =>
      expect(result.current.account.user).toEqual({
        id: 'user-1',
        email: 'new@b.com',
        memberships: [],
      }),
    );
  });

  it('register rejects and leaves the user null on a duplicate email', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.account.isLoading).toBe(false));

    await act(async () => {
      await expect(
        result.current.register.mutateAsync({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow();
    });

    expect(result.current.account.user).toBeNull();
  });

  it('logout clears the user even when the network call fails (onSettled)', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
      http.post('/api/auth/logout', () => HttpResponse.json({ message: 'error' }, { status: 500 })),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() => expect(result.current.account.isLoading).toBe(false));

    await act(async () => {
      await result.current.login.mutateAsync({ email: 'a@b.com', password: 'password123' });
    });
    await waitFor(() => expect(result.current.account.user).not.toBeNull());

    await act(async () => {
      await result.current.logout.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.account.user).toBeNull());
  });

  describe('user switch', () => {
    const base = {
      firstName: null,
      lastName: null,
      avatarUrl: null,
      emailVerified: true,
      emailNotificationsEnabled: true,
      memberships: [],
    };
    const userA: User = { ...base, id: 'user-a', email: 'a@b.com' };
    const userB: User = { ...base, id: 'user-b', email: 'b@b.com' };

    it('logout removes every query but the session, which is kept as null', async () => {
      server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
      const { result } = renderHook(useHarness, { wrapper });
      await waitFor(() => expect(result.current.account.isLoading).toBe(false));
      queryClient.setQueryData(sessionQueryKey, userA);
      queryClient.setQueryData(['me', 'teams'], [{ id: 'team-a' }]);
      queryClient.setQueryData(['me', 'dashboard', {}], { greeting: 'A' });
      await waitFor(() => expect(result.current.account.user?.id).toBe('user-a'));

      await act(async () => {
        await result.current.logout.mutateAsync();
      });

      await waitFor(() => expect(result.current.account.user).toBeNull());
      await waitFor(() => expect(queryClient.getQueryData(['me', 'teams'])).toBeUndefined());
      expect(queryClient.getQueryData(['me', 'dashboard', {}])).toBeUndefined();
      expect(queryClient.getQueryState(sessionQueryKey)?.data).toBeNull();
    });

    it('logout fires no request for the data it just dropped', async () => {
      const requested: string[] = [];
      server.use(
        http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
        http.get('/api/me/teams', () => {
          requested.push('/me/teams');
          return HttpResponse.json([]);
        }),
      );
      // Mirrors ProtectedRoute: the query is only mounted while a user is
      // logged in, so setting the session to null unmounts it before its
      // cache entry is removed (a still-mounted observer would refetch).
      function Screen() {
        useQuery({
          queryKey: ['me', 'teams'],
          queryFn: () => apiClient.get('/me/teams'),
        });
        return null;
      }
      let logout: ReturnType<typeof useLogout> | undefined;
      function Harness() {
        const { user } = useAccount();
        logout = useLogout();
        return user ? <Screen /> : null;
      }
      queryClient.setQueryData(sessionQueryKey, userA);
      render(<Harness />, { wrapper });
      await waitFor(() => expect(requested).toHaveLength(1));

      await act(async () => {
        await logout?.mutateAsync();
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(requested).toHaveLength(1);
    });

    it('login as another user drops the previous user cache', async () => {
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json({ accessToken: 'access-b', user: userB }),
        ),
      );
      const { result } = renderHook(useHarness, { wrapper });
      await waitFor(() => expect(result.current.account.isLoading).toBe(false));
      queryClient.setQueryData(sessionQueryKey, userA);
      queryClient.setQueryData(['me', 'personas'], [{ id: 'a-child' }]);

      await act(async () => {
        await result.current.login.mutateAsync({ email: 'b@b.com', password: 'password123' });
      });

      expect(queryClient.getQueryData(['me', 'personas'])).toBeUndefined();
      expect(queryClient.getQueryData(sessionQueryKey)).toEqual(userB);
    });

    it('replaceSession with a user keeps nothing but the session entry', () => {
      queryClient.setQueryData(['clubs'], [{ id: 'club-a' }]);
      queryClient.setQueryData(['clubs', 'club-a', 'teams'], []);
      queryClient.setQueryData(['notifications', {}], []);

      replaceSession(queryClient, userB);

      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([sessionQueryKey]);
      expect(queryClient.getQueryData(sessionQueryKey)).toEqual(userB);
    });
  });
});
