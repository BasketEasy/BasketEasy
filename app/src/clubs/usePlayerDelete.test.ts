import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';
import { usePlayerDelete } from './usePlayerDelete';

describe('usePlayerDelete', () => {
  it('refreshes every team query that names the player, and the lists of the club that do not', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/players/player-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => usePlayerDelete('club-1'), { wrapper });

    result.current.mutate('player-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(
      [
        ...TEAM_EVENT_LABELS,
        'other team events',
        'team roster',
        'team stats',
        'jersey rotation',
        'my teams',
        'personas',
        'dashboard',
        'club players',
      ].sort(),
    );
  });
});
