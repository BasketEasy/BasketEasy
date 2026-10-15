import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useEventLogisticsSet } from './useEventLogisticsSet';

describe('useEventLogisticsSet', () => {
  it('PATCHes the field/teamPlayerId, stores the event and refreshes what mirrors the assignment', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/logistics', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ id: 'event-1', type: 'MATCH' });
      }),
    );

    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useEventLogisticsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', field: 'JERSEYS', teamPlayerId: 'tp-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ field: 'JERSEYS', teamPlayerId: 'tp-1' });
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail'])).toMatchObject({
      id: 'event-1',
      type: 'MATCH',
    });
    // The lists and the dashboard carry `logistics`, and so does another
    // persona's copy of the event; nothing else under the event does.
    expect(staleLabels()).toEqual(['dashboard', 'event detail (child)', 'event lists']);
  });

  it('sends a null teamPlayerId to clear the assignment', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/logistics', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ id: 'event-1', type: 'MATCH' });
      }),
    );

    const { wrapper } = createSeededCache();
    const { result } = renderHook(() => useEventLogisticsSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', field: 'BALLS', teamPlayerId: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ field: 'BALLS', teamPlayerId: null });
  });
});
