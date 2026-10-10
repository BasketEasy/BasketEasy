import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { storeTeamEvent } from './eventCache';
import { isEventDetailQuery, teamEventQueryKey } from './queryKeys';

const event = { id: 'event-1', myRsvpStatus: 'GOING' } as TeamEvent;

describe('storeTeamEvent', () => {
  it('writes under the persona’s key and leaves the user’s own copy alone', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(teamEventQueryKey('c', 't', 'event-1'), { id: 'event-1', own: true });
    queryClient.setQueryData(teamEventQueryKey('c', 't', 'event-1', 'child-1'), { id: 'event-1' });

    storeTeamEvent(queryClient, { clubId: 'c', teamId: 't' }, 'child-1', event);

    expect(queryClient.getQueryData(teamEventQueryKey('c', 't', 'event-1', 'child-1'))).toEqual({
      ...event,
      whatsAppShare: undefined,
      whatsAppSettings: undefined,
    });
    expect(queryClient.getQueryData(teamEventQueryKey('c', 't', 'event-1'))).toEqual({
      id: 'event-1',
      own: true,
    });
  });

  it('never creates an entry nobody read', () => {
    const queryClient = new QueryClient();

    storeTeamEvent(queryClient, { clubId: 'c', teamId: 't' }, undefined, event);

    expect(queryClient.getQueryState(teamEventQueryKey('c', 't', 'event-1'))).toBeUndefined();
  });
});

describe('isEventDetailQuery', () => {
  const isDetail = isEventDetailQuery('c', 't', 'e1');
  const base = ['clubs', 'c', 'teams', 't', 'events'];

  it('matches the event for the user and for a persona', () => {
    expect(isDetail({ queryKey: [...base, 'e1'] })).toBe(true);
    expect(isDetail({ queryKey: [...base, 'e1', { pour: 'p' }] })).toBe(true);
  });

  it('matches neither a sub-query, another event, another team nor a list', () => {
    expect(isDetail({ queryKey: [...base, 'e1', 'rsvps'] })).toBe(false);
    expect(isDetail({ queryKey: [...base, 'e1', 'rsvps', { pour: 'p' }] })).toBe(false);
    expect(isDetail({ queryKey: [...base, 'e2'] })).toBe(false);
    expect(isDetail({ queryKey: ['clubs', 'c', 'teams', 'other', 'events', 'e1'] })).toBe(false);
    expect(isDetail({ queryKey: [...base, {}] })).toBe(false);
  });
});
