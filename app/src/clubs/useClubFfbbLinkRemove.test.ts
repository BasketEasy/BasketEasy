import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useClubFfbbLinkRemove } from './useClubFfbbLinkRemove';

describe('useClubFfbbLinkRemove', () => {
  it('patches the cached club instead of refetching every query of the club', async () => {
    server.use(
      http.delete('/api/clubs/club-1/ffbb-link', () => new HttpResponse(null, { status: 204 })),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      club: { id: 'club-1', name: 'BC', ffbbClubCode: 'ABC123' },
    });
    const { result } = renderHook(() => useClubFfbbLinkRemove('club-1'), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS.club)).toEqual({
      id: 'club-1',
      name: 'BC',
      ffbbClubCode: null,
    });
    expect(staleLabels()).toEqual([]);
  });
});
