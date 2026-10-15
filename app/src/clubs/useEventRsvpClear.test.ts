import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useEventRsvpClear } from './useEventRsvpClear';

describe('useEventRsvpClear', () => {
  it('DELETEs the caller own RSVP and writes the response into the event', async () => {
    const cleared = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      myRsvpStatus: null,
      myConvocation: false,
      whatsAppShare: null,
      whatsAppSettings: null,
    };
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', () =>
        HttpResponse.json(cleared),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useEventRsvpClear('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.myRsvpStatus).toBeNull();
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail'])).toMatchObject({
      myRsvpStatus: null,
    });
    expect(staleLabels()).toEqual(
      [
        'event lists',
        'event detail (child)',
        'rsvps',
        'rsvps (child)',
        'jersey duty',
        'jersey duty (child)',
        'jersey rotation',
        'dashboard',
      ].sort(),
    );
  });
});
