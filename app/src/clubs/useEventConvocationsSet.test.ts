import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventConvocationsSet } from './useEventConvocationsSet';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventConvocationsSet', () => {
  it('PATCHes the full teamPlayerIds list and invalidates the single event, the events list, and the roster breakdown', async () => {
    let requestBody: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json([
            {
              teamPlayerId: 'tp-1',
              playerId: 'player-1',
              firstName: 'Lea',
              lastName: 'Bernard',
              role: 'PLAYER',
              convoked: true,
              convokedAt: '2026-01-02T00:00:00.000Z',
              isMe: true,
            },
          ]);
        },
      ),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    queryClient.setQueryData(
      ['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1', 'convocations'],
      [],
    );
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'], {
      id: 'event-1',
    });
    const { result } = renderHook(() => useEventConvocationsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', teamPlayerIds: ['tp-1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ teamPlayerIds: ['tp-1'] });
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        'clubs',
        'club-1',
        'teams',
        'team-1',
        'events',
        'event-1',
        'convocations',
      ])?.isInvalidated,
    ).toBe(true);
  });

  it('sends an empty list to clear the call-up list', async () => {
    let requestBody: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json([]);
        },
      ),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEventConvocationsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', teamPlayerIds: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ teamPlayerIds: [] });
  });
});
