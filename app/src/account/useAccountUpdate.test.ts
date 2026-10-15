import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { sessionQueryKey } from '../auth/session';
import { useAccountUpdate } from './useAccountUpdate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useAccountUpdate', () => {
  it('patches /auth/me and updates the cached session user', async () => {
    server.use(
      http.patch('/api/auth/me', async ({ request }) => {
        const body = (await request.json()) as { firstName?: string };
        return HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: body.firstName ?? null,
          lastName: 'Martin',
          avatarUrl: null,
          memberships: [],
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useAccountUpdate(), { wrapper });

    result.current.mutate({ firstName: 'Alix', lastName: 'Martin', avatarUrl: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      firstName: 'Alix',
      lastName: 'Martin',
      avatarUrl: null,
      memberships: [],
    });
  });
});
