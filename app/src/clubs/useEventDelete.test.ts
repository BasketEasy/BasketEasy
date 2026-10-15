import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventDelete } from './useEventDelete';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';

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

  it('drops what the deleted event owned and refetches only the lists, the rotation, the dashboard and the season table', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/events/event-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels, removedLabels } = createSeededCache();
    const { result } = renderHook(() => useEventDelete('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removedLabels()).toEqual(
      [
        'rsvps',
        'rsvps (child)',
        'convocations',
        'convocations (child)',
        'jersey duty',
        'jersey duty (child)',
        'votes',
        'scoresheet',
        'scoresheet extraction',
        'whatsapp share',
      ].sort(),
    );
    expect(staleLabels()).toEqual(['dashboard', 'event lists', 'jersey rotation', 'team stats']);
  });

  it('keeps the broad prefix for a series scope, whose occurrences have no id here', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/events/event-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels, removedLabels } = createSeededCache();
    const { result } = renderHook(() => useEventDelete('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', scope: 'ALL' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removedLabels()).toEqual([]);
    expect(staleLabels()).toEqual(
      [...TEAM_EVENT_LABELS, 'jersey rotation', 'dashboard', 'team stats'].sort(),
    );
  });
});
