import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventConvocations } from './useEventConvocations';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return wrapper;
}

describe('useEventConvocations', () => {
  it('does not fetch while disabled', async () => {
    let callCount = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () => {
        callCount += 1;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () => useEventConvocations('club-1', 'team-1', 'event-1', false),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(callCount).toBe(0);
  });

  it('fetches the roster breakdown once enabled', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([
          {
            teamPlayerId: 'tp-1',
            playerId: 'player-1',
            firstName: 'Lea',
            lastName: 'Bernard',
            role: 'PLAYER',
            convoked: true,
            convokedAt: '2026-01-02T00:00:00.000Z',
            isMe: true,
          },
        ]),
      ),
    );

    const { result } = renderHook(() => useEventConvocations('club-1', 'team-1', 'event-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].convoked).toBe(true);
  });
});
