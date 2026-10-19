import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { MatchStats, UpdateMatchStatsRequest } from '@basketeasy/types/team-stats';
import { server } from '../mocks/server';
import { matchStatsQueryKey } from './queryKeys';
import { createSeededCache } from './testCache';
import { useUpdateMatchStats } from './useUpdateMatchStats';

const request: UpdateMatchStatsRequest = { ourScore: 62, theirScore: 55, periods: [], lines: [] };
const response: MatchStats = {
  hasStats: false,
  lines: [],
  manuallyEdited: true,
  scoreboard: { ourScore: 62, theirScore: 55, periods: [] },
};

describe('useUpdateMatchStats', () => {
  it('PUTs the request, writes the answer into the match entry and leaves that entry fresh', async () => {
    let body: unknown;
    server.use(
      http.put('/api/clubs/club-1/teams/team-1/stats/matches/event-1', async ({ request: req }) => {
        body = await req.json();
        return HttpResponse.json(response);
      }),
    );
    const { wrapper, queryClient } = createSeededCache();
    const key = matchStatsQueryKey('club-1', 'team-1', 'event-1');
    queryClient.setQueryData(key, { hasStats: false, lines: [] });
    const { result } = renderHook(() => useUpdateMatchStats('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate(request);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual(request);
    expect(queryClient.getQueryData(key)).toEqual(response);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it('refreshes what the write moves (result, sheet, season, lists, dashboard) and nothing else', async () => {
    server.use(
      http.put('/api/clubs/club-1/teams/team-1/stats/matches/event-1', () =>
        HttpResponse.json(response),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useUpdateMatchStats('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate(request);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(
      [
        'dashboard',
        'event detail',
        'event detail (child)',
        'event lists',
        'scoresheet',
        'scoresheet extraction',
        'team stats',
      ].sort(),
    );
  });
});
