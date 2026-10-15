import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache } from './testCache';
import { useClubMemberRemove } from './useClubMemberRemove';

describe('useClubMemberRemove', () => {
  it('refreshes the members and the admin candidates of every team, not the admins themselves', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/members/user-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useClubMemberRemove('club-1'), { wrapper });

    result.current.mutate('user-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual([
      'club members',
      'other team admin candidates',
      'team admin candidates',
    ]);
  });
});
