import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useTeamSeasonStats } from './useTeamSeasonStats';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return wrapper;
}

const seasonStats = {
  seasonYear: 2026,
  seasonStart: '2026-09-01T00:00:00.000Z',
  seasonEnd: '2027-08-31T23:59:59.999Z',
  matchesPlayed: 8,
  availableSeasons: [2026, 2025],
  players: [],
};

describe('useTeamSeasonStats', () => {
  it('asks for the current season when none is given', async () => {
    let requestUrl: string | undefined;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/stats', ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json(seasonStats);
      }),
    );

    const { result } = renderHook(() => useTeamSeasonStats('club-1', 'team-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // No season param at all — resolving the boundary is the server's job.
    expect(requestUrl).not.toContain('season=');
    expect(result.current.data).toEqual(seasonStats);
  });

  it('sends the requested season', async () => {
    let requestUrl: string | undefined;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/stats', ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({ ...seasonStats, seasonYear: 2025 });
      }),
    );

    const { result } = renderHook(() => useTeamSeasonStats('club-1', 'team-1', 2025), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestUrl).toContain('season=2025');
  });

  it('surfaces a failure rather than an empty season', async () => {
    server.use(
      http.get(
        '/api/clubs/club-1/teams/team-1/stats',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useTeamSeasonStats('club-1', 'team-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
