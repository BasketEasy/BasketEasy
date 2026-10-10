import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useEventConvocationsSet } from './useEventConvocationsSet';

describe('useEventConvocationsSet', () => {
  it('PATCHes the full teamPlayerIds list, stores the roster it answers with and refreshes what the call-up moves', async () => {
    let requestBody: unknown;
    const roster = [
      {
        teamPlayerId: 'tp-1',
        playerId: 'player-1',
        firstName: 'Lea',
        lastName: 'Bernard',
        role: 'PLAYER',
        convoked: true,
        convokedAt: '2026-01-02T00:00:00.000Z',
        isMe: true,
      },
    ];
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json(roster);
        },
      ),
    );

    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useEventConvocationsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', teamPlayerIds: ['tp-1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ teamPlayerIds: ['tp-1'] });
    expect(queryClient.getQueryData(SEEDED_KEYS.convocations)).toEqual(roster);
    // The RSVP roster, the votes, the scoresheet and the WhatsApp share do not
    // read a convocation. The wash does, and the event carries the summary.
    expect(staleLabels()).toEqual(
      [
        'convocations (child)',
        'event detail',
        'event detail (child)',
        'event lists',
        'jersey duty',
        'jersey duty (child)',
        'jersey rotation',
        'dashboard',
      ].sort(),
    );
  });

  it('sends an empty list to clear the call-up list', async () => {
    let requestBody: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json([]);
        },
      ),
    );

    const { wrapper } = createSeededCache();
    const { result } = renderHook(() => useEventConvocationsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', teamPlayerIds: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ teamPlayerIds: [] });
  });
});
