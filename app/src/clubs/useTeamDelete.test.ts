import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache } from './testCache';
import { useTeamDelete } from './useTeamDelete';

describe('useTeamDelete', () => {
  it('refreshes the club teams, « Mes équipes » and the home', async () => {
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1', () => new HttpResponse(null, { status: 204 })),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamDelete('club-1'), { wrapper });

    result.current.mutate('team-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['club teams', 'dashboard', 'my teams']);
  });
});
