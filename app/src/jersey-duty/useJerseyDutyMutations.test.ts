import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from '../clubs/testCache';
import { useJerseyDutyAccept } from './useJerseyDutyMutations';

describe('useJerseyDutyAccept', () => {
  it('writes the duty it answers with and refreshes the event, the lists and the rotation, but not the duty', async () => {
    const duty = { holder: { teamPlayerId: 'tp-1', firstName: 'Lea', lastName: 'B' } };
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/jersey-duty/accept', () =>
        HttpResponse.json(duty),
      ),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache();
    const { result } = renderHook(() => useJerseyDutyAccept('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(SEEDED_KEYS['jersey duty'])).toEqual(duty);
    // The RSVPs, convocations, votes and scoresheet are not read by a duty.
    // The other persona's copy of the duty is, and the entry just written is not.
    expect(staleLabels()).toEqual(
      [
        'event detail',
        'event detail (child)',
        'event lists',
        'jersey duty (child)',
        'jersey rotation',
      ].sort(),
    );
  });
});
