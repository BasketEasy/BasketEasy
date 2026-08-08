import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AccountProvider } from './AccountContext';
import { useAccount } from './useAccount';
import { useLogin, useRegister, useLogout } from './mutations';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});
