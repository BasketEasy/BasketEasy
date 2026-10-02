import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useTeamAdminRemove } from './useTeamAdminRemove';

describe('useTeamAdminRemove', () => {
  it('drops the grant from the cached list and refreshes « Mes équipes », not the candidates', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/admins/user-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      'team admins': [{ userId: 'user-1' }, { userId: 'user-2' }],
    });
    const { result } = renderHook(() => useTeamAdminRemove('club-1', 'team-1'), { wrapper });

    result.current.mutate('user-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['team admins'])).toEqual([{ userId: 'user-2' }]);
    expect(staleLabels()).toEqual(['my teams']);
  });
});
