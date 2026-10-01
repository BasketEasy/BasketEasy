import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventVoteResults } from './useEventVoteResults';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return wrapper;
}

describe('useEventVoteResults', () => {
  it('fetches both categories aggregated results plus myVote', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json({
          best: [{ teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 }],
          worst: [],
          totalVoters: 3,
          votesCast: 1,
          myVote: { best: 'tp-2', worst: null },
          myVoteHidden: false,
        }),
      ),
    );

    const { result } = renderHook(() => useEventVoteResults('club-1', 'team-1', 'event-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.best).toHaveLength(1);
    expect(result.current.data?.myVote).toEqual({ best: 'tp-2', worst: null });
  });
});
