import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import {
  useAdminAuditLog,
  useAdminClubMembers,
  useAdminEvent,
  useAdminPlayer,
  useAdminPlayers,
  useAdminSearch,
  useAdminTeam,
  useAdminTeamRoster,
  useAdminUser,
  useAdminUsers,
} from './useAdminQueries';

// An audited read (ADMIN_PII_LISTED / _VIEWED) must not forward TanStack's
// `signal`: leaving the page would abort a request the server may already have
// recorded, and returning would write a second audit row. CLAUDE.md's « every
// queryFn forwards its signal » rule has this one exception, pinned here.
const query = {} as never;
const audited: Array<[string, () => unknown]> = [
  ['useAdminAuditLog', () => useAdminAuditLog(query)],
  ['useAdminClubMembers', () => useAdminClubMembers('club-1', query)],
  ['useAdminTeam', () => useAdminTeam('team-1')],
  ['useAdminTeamRoster', () => useAdminTeamRoster('team-1')],
  ['useAdminUsers', () => useAdminUsers(query)],
  ['useAdminUser', () => useAdminUser('user-1')],
  ['useAdminPlayers', () => useAdminPlayers(query)],
  ['useAdminPlayer', () => useAdminPlayer('player-1')],
  ['useAdminEvent', () => useAdminEvent('event-1')],
  ['useAdminSearch', () => useAdminSearch('dupont')],
];

describe('audited admin reads', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(audited)('%s does not forward the abort signal', async (_name, useHook) => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(useHook, { wrapper });

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0][2]).toBeUndefined();
  });
});
