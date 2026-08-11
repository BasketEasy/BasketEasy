import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventUpdate } from './useEventUpdate';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventUpdate', () => {
  it('patches /clubs/:clubId/teams/:teamId/events/:eventId and invalidates the events list cache on success', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json([
          {
            id: 'event-1',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase B',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: '2026-01-01',
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
    const { result } = renderHook(() => useEventUpdate('club-1', 'team-1'), { wrapper });

    result.current.mutate({
      eventId: 'event-1',
      dto: { location: 'Gymnase B', scope: 'ALL' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedBody).toEqual({ location: 'Gymnase B', scope: 'ALL' });
    expect(result.current.data).toHaveLength(1);
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
  });
});
