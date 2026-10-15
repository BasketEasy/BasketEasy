import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useTeamUpdate } from './useTeamUpdate';

const team = { id: 'team-1', name: 'U15 F', jerseyRotationEnabled: true };

describe('useTeamUpdate', () => {
  it('writes the team and refreshes « Mes équipes » and the home when its name changes', async () => {
    server.use(http.patch('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(team)));
    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamUpdate('club-1', 'team-1'), { wrapper });

    result.current.mutate({ name: 'U15 F' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['team (details)'])).toEqual(team);
    expect(staleLabels()).toEqual(['club teams', 'dashboard', 'my teams']);
  });

  it('leaves « Mes équipes » and the home alone for the rotation switch', async () => {
    server.use(http.patch('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(team)));
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamUpdate('club-1', 'team-1'), { wrapper });

    result.current.mutate({ jerseyRotationEnabled: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['club teams']);
  });
});
