import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { usePlayerCreate } from './usePlayerCreate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('usePlayerCreate', () => {
  it('posts to /clubs/:clubId/players and caches the new player in the players list', async () => {
    server.use(
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        const body = (await request.json()) as { firstName: string; lastName: string };
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: body.firstName,
          lastName: body.lastName,
          createdAt: '2026-01-01',
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => usePlayerCreate('club-1'), { wrapper });

    result.current.mutate({ firstName: 'A', lastName: 'B' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs', 'club-1', 'players'])).toEqual([
      { id: 'p1', clubId: 'club-1', firstName: 'A', lastName: 'B', createdAt: '2026-01-01' },
    ]);
  });
});
