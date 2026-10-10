import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache } from './testCache';
import { useFfbbLinkRemove } from './useFfbbLinkRemove';

describe('useFfbbLinkRemove', () => {
  it('refreshes the team links and the poule results read from them, and nothing else', async () => {
    server.use(
      http.delete(
        '/api/clubs/club-1/teams/team-1/ffbb-links/link-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useFfbbLinkRemove('club-1', 'team-1'), { wrapper });

    result.current.mutate('link-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['ffbb links', 'poule results']);
  });
});
