import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';
import { useTeamPlayerAdd } from './useTeamPlayerAdd';

describe('useTeamPlayerAdd', () => {
  it('refreshes what names or counts the roster of this team, and no other team', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json({ id: 'tp-1' })),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamPlayerAdd('club-1', 'team-1'), { wrapper });

    result.current.mutate({ playerId: 'player-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(
      [
        ...TEAM_EVENT_LABELS,
        'team roster',
        'team stats',
        'jersey rotation',
        'my teams',
        'personas',
        'dashboard',
      ].sort(),
    );
  });
});
