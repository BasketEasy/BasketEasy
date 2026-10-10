import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { teamAdminsQueryKey } from './queryKeys';
import { useTeamAdminAdd } from './useTeamAdminAdd';

const added = { userId: 'user-2', email: 'b@b.fr' };

describe('useTeamAdminAdd', () => {
  it('appends the grant to the cached list and refreshes « Mes équipes », not the candidates', async () => {
    server.use(http.post('/api/clubs/club-1/teams/team-1/admins', () => HttpResponse.json(added)));
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      'team admins': [{ userId: 'user-1' }],
    });
    const { result } = renderHook(() => useTeamAdminAdd('club-1', 'team-1'), { wrapper });

    result.current.mutate({ userId: 'user-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['team admins'])).toEqual([
      { userId: 'user-1' },
      added,
    ]);
    // The candidates are the members of the linked clubs, whoever already holds a grant.
    expect(staleLabels()).toEqual(['my teams']);
  });

  it('does not turn a list that was never read into a one-row list that looks fresh', async () => {
    server.use(http.post('/api/clubs/club-1/teams/team-1/admins', () => HttpResponse.json(added)));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useTeamAdminAdd('club-1', 'team-1'), { wrapper });

    result.current.mutate({ userId: 'user-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(teamAdminsQueryKey('club-1', 'team-1'))).toBeUndefined();
  });
});
