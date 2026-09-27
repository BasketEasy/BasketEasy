import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { ActingAsContext, type ActingAsContextValue } from '../guardians/useActingAs';
import { useEventShow } from './useEventShow';

const leo = {
  playerId: 'leo',
  firstName: 'Léo',
  lastName: 'Martin',
  clubId: 'club-1',
  clubName: 'ASBC',
  teams: [{ teamId: 'team-1', teamName: 'U11' }],
  pendingCount: 0,
};

function acting(forPlayerId: string | null): ActingAsContextValue {
  return {
    forPlayerId,
    persona: forPlayerId ? leo : null,
    personas: undefined,
    isReady: true,
    setForPlayerId: () => undefined,
    isSwitcherOpen: false,
    setSwitcherOpen: () => undefined,
  };
}

describe('useEventShow across personas', () => {
  it('never shows one persona’s answer under the other’s name', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', ({ request }) => {
        const forPlayerId = new URL(request.url).searchParams.get('forPlayerId');
        return HttpResponse.json({
          id: 'event-1',
          myRsvpStatus: forPlayerId === 'leo' ? 'NOT_GOING' : 'GOING',
        });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let value = acting(null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useEventShow('club-1', 'team-1', 'event-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.myRsvpStatus).toBe('GOING'));

    value = acting('leo');
    rerender();

    // Switching is a different query, not the same cache entry reused: until
    // Léo's answer arrives there is no data at all, never « Moi »'s GOING.
    expect(result.current.data?.myRsvpStatus).not.toBe('GOING');
    await waitFor(() => expect(result.current.data?.myRsvpStatus).toBe('NOT_GOING'));
  });

  it('stays the reader themself on a team the child is not on', async () => {
    let seen: string | null = 'unset';
    server.use(
      http.get('/api/clubs/club-1/teams/team-9/events/event-1', ({ request }) => {
        seen = new URL(request.url).searchParams.get('forPlayerId');
        return HttpResponse.json({ id: 'event-1', myRsvpStatus: null });
      }),
    );
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ActingAsContext.Provider value={acting('leo')}>{children}</ActingAsContext.Provider>
      </QueryClientProvider>
    );
    renderHook(() => useEventShow('club-1', 'team-9', 'event-1'), { wrapper });

    await waitFor(() => expect(seen).toBeNull());
  });
});
