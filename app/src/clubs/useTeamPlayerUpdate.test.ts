import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';
import { useTeamPlayerUpdate } from './useTeamPlayerUpdate';

function patchPlayer() {
  server.use(
    http.patch('/api/clubs/club-1/teams/team-1/players/player-1', () =>
      HttpResponse.json({ id: 'tp-1' }),
    ),
  );
}

describe('useTeamPlayerUpdate', () => {
  it('refreshes the rotation and every event of the team for a wash exemption', async () => {
    patchPlayer();
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamPlayerUpdate('club-1', 'team-1'), { wrapper });

    result.current.mutate({ playerId: 'player-1', jerseyDutyExempt: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual([...TEAM_EVENT_LABELS, 'team roster', 'jersey rotation'].sort());
  });

  it('refreshes only the rosters that print a role for a role change, not the rotation', async () => {
    patchPlayer();
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamPlayerUpdate('club-1', 'team-1'), { wrapper });

    result.current.mutate({ playerId: 'player-1', role: 'COACH' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(
      [
        'team roster',
        'my teams',
        'rsvps',
        'rsvps (child)',
        'convocations',
        'convocations (child)',
        'other event rsvps',
        'other event convocations',
      ].sort(),
    );
  });
});
