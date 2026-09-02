import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { eventScoresheetExtractionQueryKey } from './queryKeys';
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
          });
        },
      ),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(
      () => useConfirmEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate(corrections);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(confirmRequestBody).toEqual({ corrections });
    expect(
      queryClient.getQueryData(eventScoresheetExtractionQueryKey('club-1', 'team-1', 'event-1')),
    ).toEqual({
      status: 'CONFIRMED',
      parsedData: corrections,
      confidence: 0.72,
      failureReason: null,
      reviewedByUserId: 'user-1',
      reviewedAt: '2026-01-01T21:00:00.000Z',
    });
  });

  it('sends corrections as undefined when calling mutate with no corrections', async () => {
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
          });
        },
      ),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useConfirmEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(confirmRequestBody).toEqual({});
  });
});
