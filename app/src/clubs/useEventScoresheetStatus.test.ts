import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useEventScoresheetStatus } from './useEventScoresheetStatus';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return wrapper;
}

describe('useEventScoresheetStatus', () => {
  it('returns null before any upload', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json(null),
      ),
    );

    const { result } = renderHook(() => useEventScoresheetStatus('club-1', 'team-1', 'event-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns the current status once uploaded', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json({
          status: 'UPLOADED',
          uploadedByTeamPlayerId: 'tp-1',
          uploadedAt: '2026-01-01T20:00:00.000Z',
        }),
      ),
    );

    const { result } = renderHook(() => useEventScoresheetStatus('club-1', 'team-1', 'event-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('UPLOADED');
  });
});
