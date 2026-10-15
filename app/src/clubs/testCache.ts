import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const TEAM = ['clubs', 'club-1', 'teams', 'team-1'] as const;
const EVENT = [...TEAM, 'events', 'event-1'] as const;
const CHILD = { pour: 'child-1' };

/**
 * One cache entry per kind of query a team's mutations can touch, by a label a
 * test can read. A mutation test seeds them all, runs the write and asserts the
 * exact set of labels that ended up stale, so it pins what is left alone as well
 * as what is refetched.
 */
export const SEEDED_KEYS = {
  'event lists': [...TEAM, 'events', {}],
  'event detail': EVENT,
  'event detail (child)': [...EVENT, CHILD],
  rsvps: [...EVENT, 'rsvps'],
  'rsvps (child)': [...EVENT, 'rsvps', CHILD],
  convocations: [...EVENT, 'convocations'],
  'convocations (child)': [...EVENT, 'convocations', CHILD],
  'jersey duty': [...EVENT, 'jersey-duty'],
  'jersey duty (child)': [...EVENT, 'jersey-duty', CHILD],
  votes: [...EVENT, 'votes'],
  scoresheet: [...EVENT, 'scoresheet'],
  'scoresheet extraction': [...EVENT, 'scoresheet-extraction'],
  'whatsapp share': [...EVENT, 'whatsapp-share'],
  'other event detail': [...TEAM, 'events', 'event-2'],
  'other event rsvps': [...TEAM, 'events', 'event-2', 'rsvps'],
  'other event convocations': [...TEAM, 'events', 'event-2', 'convocations'],
  'jersey rotation': [...TEAM, 'jersey-rotation'],
  'team stats': [...TEAM, 'stats', 'current'],
  'team roster': [...TEAM, 'players', {}],
  'team (details)': TEAM,
  'team admins': [...TEAM, 'admins'],
  'team admin candidates': [...TEAM, 'admins', 'eligible'],
  'team clubs': [...TEAM, 'clubs', {}],
  'poule results': [...TEAM, 'ffbb-poule-results'],
  'ffbb links': [...TEAM, 'ffbb-links'],
  'other team events': ['clubs', 'club-1', 'teams', 'team-2', 'events', {}],
  'other team admin candidates': ['clubs', 'club-1', 'teams', 'team-2', 'admins', 'eligible'],
  'club teams': ['clubs', 'club-1', 'teams', {}],
  'club players': ['clubs', 'club-1', 'players', {}],
  'club members': ['clubs', 'club-1', 'members', {}],
  club: ['clubs', 'club-1'],
  dashboard: ['me', 'dashboard', {}],
  'my teams': ['me', 'teams'],
  personas: ['me', 'personas'],
} as const;

type SeededLabel = keyof typeof SEEDED_KEYS;

/** A client with every seeded entry in place, a wrapper for `renderHook`, and the labels now stale. */
export function createSeededCache(overrides: Partial<Record<SeededLabel, unknown>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const label of Object.keys(SEEDED_KEYS) as SeededLabel[]) {
    queryClient.setQueryData(SEEDED_KEYS[label], label in overrides ? overrides[label] : { label });
  }
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const staleLabels = () =>
    (Object.keys(SEEDED_KEYS) as SeededLabel[])
      .filter((label) => queryClient.getQueryState(SEEDED_KEYS[label])?.isInvalidated)
      .sort();
  /** Labels whose entry is gone from the cache. */
  const removedLabels = () =>
    (Object.keys(SEEDED_KEYS) as SeededLabel[])
      .filter((label) => queryClient.getQueryState(SEEDED_KEYS[label]) === undefined)
      .sort();
  return { queryClient, wrapper, staleLabels, removedLabels };
}

/** Every seeded entry under the team's `events` prefix: the broad invalidation of a series-wide write. */
export const TEAM_EVENT_LABELS: SeededLabel[] = [
  'event lists',
  'event detail',
  'event detail (child)',
  'rsvps',
  'rsvps (child)',
  'convocations',
  'convocations (child)',
  'jersey duty',
  'jersey duty (child)',
  'votes',
  'scoresheet',
  'scoresheet extraction',
  'whatsapp share',
  'other event detail',
  'other event rsvps',
  'other event convocations',
];
