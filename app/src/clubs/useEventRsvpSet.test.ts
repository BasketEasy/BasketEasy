import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useJerseyDuty, useJerseyRotation } from '../jersey-duty/useJerseyDuty';
import { server } from '../mocks/server';
import { createSeededCache, SEEDED_KEYS } from './testCache';
import { useEventConvocations } from './useEventConvocations';
import { useEventList } from './useEventList';
import { useEventRsvpSet } from './useEventRsvpSet';
import { useEventRsvps } from './useEventRsvps';
import { useEventShow } from './useEventShow';
import { useEventVoteResults } from './useEventVoteResults';
import { useMyAgenda } from './useMyAgenda';

const answered = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'TRAINING',
  startsAt: '2026-01-05T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: null,
  recurrenceId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  myRsvpStatus: 'GOING',
  myConvocation: false,
  whatsAppShare: null,
  whatsAppSettings: null,
};

describe('useEventRsvpSet', () => {
  it('PATCHes the status and writes the response into the event instead of refetching it', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(answered);
      }),
    );
    const { wrapper, queryClient, staleLabels } = createSeededCache({
      // A manager who is also rostered: the own-answer route leaves the
      // manager-only WhatsApp fields out of the response.
      'event detail': {
        id: 'event-1',
        myRsvpStatus: null,
        whatsAppShare: { state: 'PENDING' },
        whatsAppSettings: { effective: { enabled: true } },
      },
    });
    const { result } = renderHook(() => useEventRsvpSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', status: 'GOING' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestBody).toEqual({ status: 'GOING' });
    expect(queryClient.getQueryData(SEEDED_KEYS['event detail'])).toEqual({
      ...answered,
      whatsAppShare: { state: 'PENDING' },
      whatsAppSettings: { effective: { enabled: true } },
    });
    // What moved: the lists, the RSVP roster and the wash (it is built from
    // RSVPs), the rotation and the home, plus the other persona's copy of the
    // event. Everything else an event owns is left alone.
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

  it('does not create an event entry that was never read', async () => {
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', () =>
        HttpResponse.json(answered),
      ),
    );
    const { wrapper, queryClient } = createSeededCache();
    queryClient.removeQueries({ queryKey: SEEDED_KEYS['event detail'], exact: true });
    const { result } = renderHook(() => useEventRsvpSet('club-1', 'team-1'), { wrapper });

    result.current.mutate({ eventId: 'event-1', status: 'GOING' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(SEEDED_KEYS['event detail'])).toBeUndefined();
  });

  // The match page with everything it can have open, then one answer. Counts the
  // GETs the answer costs, per route: the event is written from the response,
  // each of the other reads is fetched once (never twice, which is what an
  // overlapping prefix invalidation did), and what an RSVP cannot change is not
  // fetched at all.
  it('costs one request per read it changes, and none for the event it just wrote', async () => {
    const base = '/api/clubs/club-1/teams/team-1';
    const gets = new Map<string, number>();
    const count = (name: string, body: Record<string, unknown> | unknown[]) => {
      gets.set(name, (gets.get(name) ?? 0) + 1);
      return HttpResponse.json(body);
    };
    server.use(
      http.get(`${base}/events/event-1`, () =>
        count('detail', { id: 'event-1', myRsvpStatus: null }),
      ),
      http.get(`${base}/events`, () =>
        count('lists', { items: [], total: 0, page: 1, pageSize: 25 }),
      ),
      http.get(`${base}/events/event-1/rsvps`, () => count('rsvps', [])),
      http.get(`${base}/events/event-1/convocations`, () => count('convocations', [])),
      http.get(`${base}/events/event-1/votes`, () => count('votes', {})),
      http.get(`${base}/events/event-1/jersey-duty`, () => count('jersey-duty', {})),
      http.get(`${base}/jersey-rotation`, () => count('rotation', {})),
      http.get('/api/me/dashboard', () => count('dashboard', { events: [] })),
      http.patch(`${base}/events/event-1/rsvp`, () => HttpResponse.json(answered)),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(
      () => {
        const reads = [
          useEventShow('club-1', 'team-1', 'event-1'),
          useEventList('club-1', 'team-1'),
          useEventRsvps('club-1', 'team-1', 'event-1', true),
          useEventConvocations('club-1', 'team-1', 'event-1', true),
          useEventVoteResults('club-1', 'team-1', 'event-1', '2026-01-05T18:00:00.000Z'),
          useJerseyDuty('club-1', 'team-1', 'event-1'),
          useJerseyRotation('club-1', 'team-1'),
          useMyAgenda(),
        ];
        return { reads, rsvp: useEventRsvpSet('club-1', 'team-1') };
      },
      { wrapper },
    );
    // The page has just opened: wait for the first read of each.
    await waitFor(() => expect(result.current.reads.every((read) => !read.isFetching)).toBe(true));
    gets.clear();

    result.current.rsvp.mutate({ eventId: 'event-1', status: 'GOING' });
    await waitFor(() => expect(result.current.rsvp.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.reads.every((read) => !read.isFetching)).toBe(true));

    expect(Object.fromEntries(gets)).toEqual({
      lists: 1,
      rsvps: 1,
      'jersey-duty': 1,
      rotation: 1,
      dashboard: 1,
    });
  });
});
