import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from '../clubs/testCache';
import { useEventMeetingUpdate } from './useEventMeetingUpdate';

const plan = {
  meetingPoint: { name: 'Parking', address: '1 rue X' },
  meetsAt: '2026-01-10T17:00:00.000Z',
};

describe('useEventMeetingUpdate', () => {
  it('patches the plan into every persona’s copy of the event and refreshes only what mirrors it', async () => {
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/meeting', () =>
        HttpResponse.json(plan),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      'event detail': { id: 'event-1', meetingPlan: null },
      'event detail (child)': { id: 'event-1', meetingPlan: null },
    });
    const { result } = renderHook(() => useEventMeetingUpdate('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate({ meetingPoint: plan.meetingPoint });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail'])).toEqual({
      id: 'event-1',
      meetingPlan: plan,
    });
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail (child)'])).toEqual({
      id: 'event-1',
      meetingPlan: plan,
    });
    // The lists and the dashboard carry `meetingPlan`; the share message names
    // the rendez-vous. The RSVPs, convocations and votes do not.
    expect(staleLabels()).toEqual(['dashboard', 'event lists', 'whatsapp share']);
  });
});
