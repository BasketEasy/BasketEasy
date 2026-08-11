import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventDelete } from './useEventDelete';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventDelete', () => {
  it('deletes without a scope query string when scope is THIS or omitted', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1', ({ request }) => {
        requestedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'teams', 'team-1', 'events', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const { result } = renderHook(() => useEventDelete('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedUrl).not.toContain('?scope=');
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'teams', 'team-1', 'events', {}])
        ?.isInvalidated,
    ).toBe(true);
  });

  it('appends ?scope= when a non-THIS scope is given', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1', ({ request }) => {
        requestedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEventDelete('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', scope: 'THIS_AND_FUTURE' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedUrl).toContain('?scope=THIS_AND_FUTURE');
  });
});
