import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useTeamCreate } from './useTeamCreate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useTeamCreate', () => {
  it('posts to /clubs/:clubId/teams and invalidates the teams list cache on success', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        const body = (await request.json()) as { name: string; category: string; gender: string };
        return HttpResponse.json({
          id: 'team-1',
          name: body.name,
          category: body.category,
          gender: body.gender,
          createdAt: '2026-01-01',
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'teams', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const { result } = renderHook(() => useTeamCreate('club-1'), { wrapper });

    result.current.mutate({ name: 'U15', category: 'U15', gender: 'MEN' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['clubs', 'club-1', 'teams', {}])?.isInvalidated).toBe(true);
  });
});
