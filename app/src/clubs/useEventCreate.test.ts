import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventCreate } from './useEventCreate';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventCreate', () => {
  it('posts to /clubs/:clubId/teams/:teamId/events and invalidates the events list cache on success', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events', async ({ request }) => {
        const body = (await request.json()) as { startsAt: string; location: string };
        return HttpResponse.json([
          {
            id: 'event-1',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: body.startsAt,
            location: body.location,
            notes: null,
            opponentName: null,
            recurrenceId: null,
            createdAt: '2026-01-01',
            myRsvpStatus: null,
            myConvocation: false,
          },
        ]);
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const { result } = renderHook(() => useEventCreate('club-1', 'team-1'), { wrapper });

    result.current.mutate({
      type: 'TRAINING',
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'Gymnase A',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
  });

  it('refreshes every event of the team, the rotation and the dashboard, and nothing else', async () => {
    server.use(http.post('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json([])));
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useEventCreate('club-1', 'team-1'), { wrapper });

    result.current.mutate({
      type: 'TRAINING',
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'A',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual([...TEAM_EVENT_LABELS, 'jersey rotation', 'dashboard'].sort());
  });
});
