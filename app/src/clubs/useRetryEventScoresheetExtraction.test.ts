import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { eventScoresheetStatusQueryKey } from './queryKeys';
import { createSeededCache } from './testCache';
import { useRetryEventScoresheetExtraction } from './useRetryEventScoresheetExtraction';

describe('useRetryEventScoresheetExtraction', () => {
  it('writes the queued sheet and marks the failed read stale without re-reading it', async () => {
    let extractionGets = 0;
    const queued = { status: 'QUEUED', uploadedByTeamPlayerId: 'tp-1', uploadedAt: 'x' };
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/retry', () =>
        HttpResponse.json(queued),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () => {
        extractionGets += 1;
        return HttpResponse.json({ status: 'FAILED' });
      }),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(
      () => useRetryEventScoresheetExtraction('club-1', 'team-1', 'event-1'),
      { wrapper },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(eventScoresheetStatusQueryKey('club-1', 'team-1', 'event-1')),
    ).toEqual(queued);
    // Fetching the same FAILED row now would make it look fresh when the job ends.
    expect(staleLabels()).toEqual(['scoresheet extraction']);
    expect(extractionGets).toBe(0);
  });
});
