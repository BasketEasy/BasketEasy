import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache } from './testCache';
import { useFfbbLinkAdd } from './useFfbbLinkAdd';

describe('useFfbbLinkAdd', () => {
  it('refreshes the team links and the poule results read from them, and nothing else', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json({ id: 'link-1' }),
      ),
    );
    const { wrapper, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useFfbbLinkAdd('club-1', 'team-1'), { wrapper });

    result.current.mutate({ ffbbTeamUrl: 'https://competitions.ffbb.com/x/equipes/1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleLabels()).toEqual(['ffbb links', 'poule results']);
  });
});
