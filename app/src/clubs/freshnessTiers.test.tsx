import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { EventScoresheet, EventVoteResults } from '@basketeasy/types/events';
import type { MatchStats } from '@basketeasy/types/team-stats';
import type { ScoresheetExtraction } from '@basketeasy/types/scoresheet-extraction';
import { FRESHNESS } from '../api/freshness';
import { useAdminUsers } from '../admin/useAdminQueries';
import { useRefreshPersonasOnEntry } from '../guardians/usePersonas';
import { server } from '../mocks/server';
import { notificationsQueryKey } from '../notifications/queryKeys';
import { useNotifications } from '../notifications/useNotifications';
import { matchStatsStaleTime } from './useMatchStats';
import { scoresheetExtractionStaleTime } from './useEventScoresheetExtraction';
import { scoresheetStatusStaleTime } from './useEventScoresheetStatus';
import { useEventList } from './useEventList';
import { useEventShow } from './useEventShow';
import { useMyAgenda } from './useMyAgenda';
import { usePouleResults } from './usePouleResults';
import { useTeamPlayerList } from './useTeamPlayerList';
import { useTeamShow } from './useTeamShow';
import { voteResultsStaleTime } from './useEventVoteResults';

const BASE = '/api/clubs/club-1/teams/team-1';

function createClient() {
  // The test client keeps the library's staleTime of 0: what these tests read is
  // the tier each hook sets for itself, never one inherited from a default.
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function setup() {
  const queryClient = createClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function countGets(url: string, body: unknown) {
  const counter = { calls: 0 };
  server.use(
    http.get(url, () => {
      counter.calls += 1;
      return HttpResponse.json(body as Record<string, unknown>);
    }),
  );
  return counter;
}

async function blurAndFocus() {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

/** What a hook's observer actually runs with: the tier it chose. */
function staleTimeOf(queryClient: QueryClient, queryKey: readonly unknown[]) {
  const query = queryClient.getQueryCache().find({ queryKey });
  const staleTime = query?.observers[0]?.options.staleTime;
  return typeof staleTime === 'function' ? staleTime(query as Query) : staleTime;
}

function fakeQuery<T>(data: T | undefined, dataUpdatedAt = 0) {
  return { state: { data, dataUpdatedAt } } as unknown as Query<T>;
}

describe('freshness tiers on the hooks', () => {
  it('static: a remount and a window focus read the cache (useTeamShow)', async () => {
    const team = countGets(BASE, { id: 'team-1', name: 'U15' });
    const { wrapper } = setup();

    const first = renderHook(() => useTeamShow('club-1', 'team-1'), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await blurAndFocus();
    first.unmount();
    const second = renderHook(() => useTeamShow('club-1', 'team-1'), { wrapper });
    expect(second.result.current.data).toEqual({ id: 'team-1', name: 'U15' });
    await blurAndFocus();

    expect(team.calls).toBe(1);
  });

  it('slow: a remount within ten minutes reads the cache (useTeamPlayerList)', async () => {
    const roster = countGets(`${BASE}/players`, { items: [], total: 0, page: 1, pageSize: 25 });
    const { wrapper } = setup();

    const first = renderHook(() => useTeamPlayerList('club-1', 'team-1'), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useTeamPlayerList('club-1', 'team-1'), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    await blurAndFocus();

    expect(roster.calls).toBe(1);
  });

  it('live: the event detail is its own entry on the default tier, not a cached forever one', async () => {
    countGets(`${BASE}/events/event-1`, { id: 'event-1' });
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useEventShow('club-1', 'team-1', 'event-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      staleTimeOf(queryClient, ['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1']),
    ).toBe(FRESHNESS.live);
  });

  it('the agenda is `feed` unless the caller says it looks back', async () => {
    countGets('/api/me/dashboard', { upcomingEvents: [] });
    const { queryClient, wrapper } = setup();

    renderHook(() => useMyAgenda({ from: 'a', to: 'b' }), { wrapper });
    renderHook(() => useMyAgenda({ from: 'c', to: 'd' }, { freshness: FRESHNESS.slow }), {
      wrapper,
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(staleTimeOf(queryClient, ['me', 'dashboard', { from: 'a', to: 'b' }])).toBe(
      FRESHNESS.feed,
    );
    expect(staleTimeOf(queryClient, ['me', 'dashboard', { from: 'c', to: 'd' }])).toBe(
      FRESHNESS.slow,
    );
  });

  it('the notifications feed is fresh for exactly its poll interval', async () => {
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useNotifications({ limit: 6 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(staleTimeOf(queryClient, notificationsQueryKey({ limit: 6 }))).toBe(FRESHNESS.feed);
  });

  it('poule results are not retried: the server scrapes FFBB on every attempt', async () => {
    const poule = { calls: 0 };
    server.use(
      http.get(`${BASE}/ffbb-poule-results`, () => {
        poule.calls += 1;
        return HttpResponse.json({ message: 'FFBB unreachable' }, { status: 502 });
      }),
    );
    // A client with the real retry policy would still retry a 502 twice.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 2, retryDelay: 1 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => usePouleResults('club-1', 'team-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(poule.calls).toBe(1);
  });

  it('an audited admin list is read once: going back to it writes no second audit row', async () => {
    const users = countGets('/api/admin/users', { items: [], total: 0, page: 1, pageSize: 25 });
    const { wrapper } = setup();
    const query = { q: 'a' } as never;

    const first = renderHook(() => useAdminUsers(query), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useAdminUsers(query), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    await blurAndFocus();

    expect(users.calls).toBe(1);
  });
});

describe('personas on a team page', () => {
  it('are not fetched by the team hooks themselves', async () => {
    const personas = countGets('/api/me/personas', { self: null, children: [] });
    countGets(`${BASE}/events/event-1`, { id: 'event-1' });
    countGets(`${BASE}/events`, { items: [], total: 0, page: 1, pageSize: 25 });
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(
      () => [useEventShow('club-1', 'team-1', 'event-1'), useEventList('club-1', 'team-1')],
      { wrapper },
    );
    await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(personas.calls).toBe(0);
  });

  it('are refreshed once each time the page opens, and not again while it stays open', async () => {
    const personas = countGets('/api/me/personas', { self: null, children: [] });
    const { queryClient, wrapper } = setup();

    const page = renderHook(() => useRefreshPersonasOnEntry(), { wrapper });
    await waitFor(() => expect(personas.calls).toBe(1));
    page.rerender();
    await blurAndFocus();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(personas.calls).toBe(1);

    page.unmount();
    renderHook(() => useRefreshPersonasOnEntry(), { wrapper });
    await waitFor(() => expect(personas.calls).toBe(2));
  });
});

describe('tiers that depend on the data', () => {
  const STARTS_AT = '2026-01-05T18:00:00.000Z';
  const closesAt = new Date(STARTS_AT).getTime() + 5 * 24 * 60 * 60 * 1000;

  it('vote results: live while the window is open, static only for a read taken after it closed', () => {
    const staleTime = voteResultsStaleTime(STARTS_AT);

    expect(staleTime(fakeQuery({} as EventVoteResults, closesAt - 60 * 60 * 1000))).toBe(
      FRESHNESS.live,
    );
    // A read a few seconds before the close still has the leaderboards withheld.
    expect(staleTime(fakeQuery({} as EventVoteResults, closesAt - 5_000))).toBe(FRESHNESS.live);
    expect(staleTime(fakeQuery({} as EventVoteResults, closesAt + 10 * 60_000))).toBe(
      FRESHNESS.static,
    );
  });

  it('scoresheet status: always stale while pending, static once confirmed, live otherwise', () => {
    const sheet = (status: EventScoresheet['status']) =>
      fakeQuery<EventScoresheet | null>({ status } as EventScoresheet);

    expect(scoresheetStatusStaleTime(sheet('QUEUED'))).toBe(0);
    expect(scoresheetStatusStaleTime(sheet('PROCESSING'))).toBe(0);
    expect(scoresheetStatusStaleTime(sheet('CONFIRMED'))).toBe(FRESHNESS.static);
    expect(scoresheetStatusStaleTime(sheet('NEEDS_REVIEW'))).toBe(FRESHNESS.live);
    expect(scoresheetStatusStaleTime(sheet('FAILED'))).toBe(FRESHNESS.live);
    // Nothing uploaded yet: a teammate can still do it.
    expect(scoresheetStatusStaleTime(fakeQuery<EventScoresheet | null>(null))).toBe(FRESHNESS.live);
  });

  it('scoresheet extraction: static only once confirmed', () => {
    const read = (status: ScoresheetExtraction['status']) =>
      fakeQuery<ScoresheetExtraction | null>({ status } as ScoresheetExtraction);

    expect(scoresheetExtractionStaleTime(read('CONFIRMED'))).toBe(FRESHNESS.static);
    expect(scoresheetExtractionStaleTime(read('PARSED'))).toBe(FRESHNESS.live);
    expect(scoresheetExtractionStaleTime(read('FAILED'))).toBe(FRESHNESS.live);
    expect(scoresheetExtractionStaleTime(fakeQuery<ScoresheetExtraction | null>(null))).toBe(
      FRESHNESS.live,
    );
  });

  it('match stats: live until a confirmed sheet produced lines, slow after', () => {
    expect(matchStatsStaleTime(fakeQuery({ hasStats: false, lines: [] } as MatchStats))).toBe(
      FRESHNESS.live,
    );
    expect(matchStatsStaleTime(fakeQuery({ hasStats: true, lines: [] } as MatchStats))).toBe(
      FRESHNESS.slow,
    );
  });
});
