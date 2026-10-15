import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { sessionQueryKey } from '../auth/session';
import { useClubCreate } from './useClubCreate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useClubCreate', () => {
  it('posts to /clubs and caches the created club in the clubs list', async () => {
    server.use(
      http.post('/api/clubs', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 'club-1', name: body.name, createdAt: '2026-01-01' });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useClubCreate(), { wrapper });

    result.current.mutate({ name: 'COC Basket' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs'])).toEqual([
      { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
    ]);
  });

  it('adds an ADMIN membership for the new club to the cached session user', async () => {
    server.use(
      http.post('/api/clubs', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 'club-1', name: body.name, createdAt: '2026-01-01' });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(sessionQueryKey, {
      id: 'user-1',
      email: 'a@b.com',
      firstName: null,
      lastName: null,
      avatarUrl: null,
      memberships: [{ clubId: 'club-0', role: 'MEMBER' }],
    });

    const { result } = renderHook(() => useClubCreate(), { wrapper });

    result.current.mutate({ name: 'COC Basket' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      firstName: null,
      lastName: null,
      avatarUrl: null,
      memberships: [
        { clubId: 'club-0', role: 'MEMBER' },
        { clubId: 'club-1', role: 'ADMIN' },
      ],
    });
  });
});
