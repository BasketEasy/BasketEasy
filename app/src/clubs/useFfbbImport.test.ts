import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, TEAM_EVENT_LABELS } from './testCache';
import { useFfbbImport } from './useFfbbImport';

describe('useFfbbImport', () => {
  it('refreshes every event of the team, the rotation, the dashboard and the poule results', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/ffbb-import', () =>
        HttpResponse.json({ created: 1, updated: 0, skipped: 0 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useFfbbImport('club-1', 'team-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(
      [...TEAM_EVENT_LABELS, 'jersey rotation', 'dashboard', 'poule results'].sort(),
    );
  });
});
