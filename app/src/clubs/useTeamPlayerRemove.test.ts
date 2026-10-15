import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';
import { useTeamPlayerRemove } from './useTeamPlayerRemove';

describe('useTeamPlayerRemove', () => {
  it('refreshes what names or counts the roster of this team, and no other team', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/players/player-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamPlayerRemove('club-1', 'team-1'), { wrapper });

    result.current.mutate('player-1');

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
