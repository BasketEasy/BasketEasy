import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useMyTeamList } from './useMyTeamList';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useMyTeamList', () => {
  it('fetches the current user’s teams from /me/teams', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMyTeamList(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        teamId: 'team-1',
        teamName: 'U15',
        category: 'U15',
        gender: 'MEN',
        clubId: 'club-1',
        clubName: 'COC Basket',
        isTeamAdmin: true,
        rosterRole: null,
      },
    ]);
  });
});
