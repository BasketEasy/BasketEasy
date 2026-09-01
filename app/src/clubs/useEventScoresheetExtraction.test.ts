import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventScoresheetExtraction } from './useEventScoresheetExtraction';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return wrapper;
}

describe('useEventScoresheetExtraction', () => {
  it('returns null when no extraction has run yet', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () =>
        HttpResponse.json(null),
      ),
    );

    const { result } = renderHook(
      () => useEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns the extraction data on success', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () =>
        HttpResponse.json({
          status: 'NEEDS_REVIEW',
          parsedData: {
            homeScore: 62,
            awayScore: 58,
            quarterScores: [],
            players: [],
          },
          confidence: 0.72,
          failureReason: null,
          reviewedByUserId: null,
          reviewedAt: null,
        }),
      ),
    );

    const { result } = renderHook(
      () => useEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('NEEDS_REVIEW');
    expect(result.current.data?.parsedData?.homeScore).toBe(62);
  });

  it('is not fetched when enabled: false is passed', async () => {
    let requestCount = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () => {
        requestCount += 1;
        return HttpResponse.json(null);
      }),
    );

    const { result } = renderHook(
      () => useEventScoresheetExtraction('club-1', 'team-1', 'event-1', { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isSuccess).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requestCount).toBe(0);
  });

  it('surfaces an error response', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Erreur serveur');
  });
});
