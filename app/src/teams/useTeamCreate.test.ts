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
  it('posts to /clubs/:clubId/teams and caches the created team in the club teams list', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({
          id: 'team-1',
          name: body.name,
          clubIds: ['club-1'],
          createdAt: '2026-01-01',
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useTeamCreate('club-1'), { wrapper });

    result.current.mutate({ name: 'U15 Filles' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs', 'club-1', 'teams'])).toEqual([
      { id: 'team-1', name: 'U15 Filles', clubIds: ['club-1'], createdAt: '2026-01-01' },
    ]);
  });
});
