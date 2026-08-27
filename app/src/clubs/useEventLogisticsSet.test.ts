import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventLogisticsSet } from './useEventLogisticsSet';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventLogisticsSet', () => {
  it('PATCHes the field/teamPlayerId and invalidates the event detail and events list queries', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/logistics', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ id: 'event-1', type: 'MATCH' });
      }),
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
    const { result } = renderHook(() => useEventLogisticsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', field: 'JERSEYS', teamPlayerId: 'tp-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ field: 'JERSEYS', teamPlayerId: 'tp-1' });
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'])
        ?.isInvalidated,
    ).toBe(true);
  });

  it('sends a null teamPlayerId to clear the assignment', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/logistics', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ id: 'event-1', type: 'MATCH' });
      }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEventLogisticsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', field: 'BALLS', teamPlayerId: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ field: 'BALLS', teamPlayerId: null });
  });
});
