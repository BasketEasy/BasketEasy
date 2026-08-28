import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventRsvpClear } from './useEventRsvpClear';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventRsvpClear', () => {
  it('DELETEs the caller own RSVP and invalidates the single event and the events list', async () => {
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', () =>
        HttpResponse.json({
          id: 'event-1',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          myRsvpStatus: null,
          myConvocation: false,
        }),
      ),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'], {
      id: 'event-1',
    });
    const { result } = renderHook(() => useEventRsvpClear('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.myRsvpStatus).toBeNull();
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
  });
});
