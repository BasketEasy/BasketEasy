import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { eventVoteResultsQueryKey } from './queryKeys';
import { createSeededCache } from './testCache';
import { useEventVoteCast } from './useEventVoteCast';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useEventVoteCast', () => {
  it('PATCHes the category/teamPlayerId and writes the fresh results straight into the cache', async () => {
    let requestBody: unknown;
    const freshResults = {
      best: [{ teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 1 }],
      worst: [],
      totalVoters: 3,
      votesCast: 1,
      myVote: { best: 'tp-2', worst: null },
      myVoteHidden: false,
    };
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/votes', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(freshResults);
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useEventVoteCast('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', category: 'BEST', teamPlayerId: 'tp-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ category: 'BEST', teamPlayerId: 'tp-2' });
    expect(
      queryClient.getQueryData(eventVoteResultsQueryKey('club-1', 'team-1', 'event-1')),
    ).toEqual(freshResults);
  });

  it('marks stale the dashboard (vote.hasVoted) and the season table (awards), nothing else', async () => {
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json({ best: [], worst: [], totalVoters: 1, votesCast: 1 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useEventVoteCast('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', category: 'BEST', teamPlayerId: 'tp-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['dashboard', 'team stats']);
  });
});
