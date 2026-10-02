import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { eventScoresheetExtractionQueryKey } from './queryKeys';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useConfirmEventScoresheetExtraction } from './useConfirmEventScoresheetExtraction';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

const corrections = {
  homeScore: 60,
  awayScore: 55,
  quarterScores: [],
  players: [],
  scoringPlays: [],
};

describe('useConfirmEventScoresheetExtraction', () => {
  it('PATCHes the corrections and writes the confirmed extraction into the cache', async () => {
    let confirmRequestBody: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
        async ({ request }) => {
          confirmRequestBody = await request.json();
          return HttpResponse.json({
            status: 'CONFIRMED',
            parsedData: corrections,
            confidence: 0.72,
            failureReason: null,
            reviewedByUserId: 'user-1',
            reviewedAt: '2026-01-01T21:00:00.000Z',
            suggestedRosterMapping: [],
          });
        },
      ),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(
      () => useConfirmEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate({
      corrections,
      rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(confirmRequestBody).toEqual({
      corrections,
      rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
    });
    expect(
      queryClient.getQueryData(eventScoresheetExtractionQueryKey('club-1', 'team-1', 'event-1')),
    ).toEqual({
      status: 'CONFIRMED',
      parsedData: corrections,
      confidence: 0.72,
      failureReason: null,
      reviewedByUserId: 'user-1',
      reviewedAt: '2026-01-01T21:00:00.000Z',
      suggestedRosterMapping: [],
    });
  });

  it('sends an empty mapping and no corrections through untouched', async () => {
    let confirmRequestBody: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
        async ({ request }) => {
          confirmRequestBody = await request.json();
          return HttpResponse.json({
            status: 'CONFIRMED',
            parsedData: null,
            confidence: 0.72,
            failureReason: null,
            reviewedByUserId: 'user-1',
            reviewedAt: '2026-01-01T21:00:00.000Z',
            suggestedRosterMapping: [],
          });
        },
      ),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useConfirmEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate({ rosterMapping: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(confirmRequestBody).toEqual({ rosterMapping: [] });
  });

  it('refreshes what carries the result, flips the sheet status in place and leaves the rest alone', async () => {
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
        () => HttpResponse.json({ status: 'CONFIRMED', parsedData: corrections }),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      scoresheet: { status: 'PARSED', uploadedByTeamPlayerId: 'tp-1', uploadedAt: '2026-01-01' },
    });
    const { result } = renderHook(
      () => useConfirmEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate({ corrections, rosterMapping: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS.scoresheet)).toMatchObject({ status: 'CONFIRMED' });
    expect(staleLabels()).toEqual(
      ['dashboard', 'event detail', 'event detail (child)', 'event lists', 'team stats'].sort(),
    );
  });
});
