import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventCreate } from './useEventCreate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventCreate', () => {
  it('posts to /clubs/:clubId/teams/:teamId/events and caches the new event in the events list', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events', async ({ request }) => {
        const body = (await request.json()) as { startsAt: string; location: string };
        return HttpResponse.json({
          id: 'event-1',
          teamId: 'team-1',
          startsAt: body.startsAt,
          location: body.location,
          notes: null,
          createdAt: '2026-01-01',
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useEventCreate('club-1', 'team-1'), { wrapper });

    result.current.mutate({ startsAt: '2026-01-05T18:00:00.000Z', location: 'Gymnase A' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events'])).toEqual([
      {
        id: 'event-1',
        teamId: 'team-1',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        createdAt: '2026-01-01',
      },
    ]);
  });
});
