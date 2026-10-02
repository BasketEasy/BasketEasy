import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from '../clubs/testCache';
import { useEventTravelModeSet } from './useEventTravelModeSet';

describe('useEventTravelModeSet', () => {
  it('stores the event it answers with, keeping the manager’s WhatsApp fields, and refreshes the roster rows', async () => {
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/travel-mode', () =>
        HttpResponse.json({
          id: 'event-1',
          myTravelMode: 'DIRECT',
          whatsAppShare: null,
          whatsAppSettings: null,
        }),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      'event detail': {
        id: 'event-1',
        whatsAppShare: { state: 'SENT' },
        whatsAppSettings: { a: 1 },
      },
    });
    const { result } = renderHook(() => useEventTravelModeSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', travelMode: 'DIRECT' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail'])).toEqual({
      id: 'event-1',
      myTravelMode: 'DIRECT',
      whatsAppShare: { state: 'SENT' },
      whatsAppSettings: { a: 1 },
    });
    expect(staleLabels()).toEqual(['dashboard', 'event lists', 'rsvps', 'rsvps (child)']);
  });
});
