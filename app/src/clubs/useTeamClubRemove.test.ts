import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache } from './testCache';
import { useTeamClubRemove } from './useTeamClubRemove';

describe('useTeamClubRemove', () => {
  it('refreshes the linked clubs and the admin candidates drawn from them', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/clubs/club-2',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useTeamClubRemove('club-1', 'team-1'), { wrapper });

    result.current.mutate('club-2');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['team admin candidates', 'team clubs']);
  });
});
