import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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

afterEach(() => {
  vi.useRealTimers();
});

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

  it('polls while the OCR job is still running, then stops once it lands', async () => {
    // shouldAdvanceTime keeps real time flowing so MSW's own promises still
    // resolve while the poll timer is advanced by hand.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () => {
        calls += 1;
        return HttpResponse.json({
          status: calls === 1 ? 'QUEUED' : 'NEEDS_REVIEW',
          uploadedByTeamPlayerId: 'tp-1',
          uploadedAt: '2026-01-01T20:00:00.000Z',
        });
      }),
    );

    const { result } = renderHook(() => useEventScoresheetStatus('club-1', 'team-1', 'event-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data?.status).toBe('QUEUED'));

    await act(() => vi.advanceTimersByTimeAsync(5000));
    await waitFor(() => expect(result.current.data?.status).toBe('NEEDS_REVIEW'));

    // Terminal status — the interval must stop rather than hammer the API.
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(calls).toBe(2);
  });
});
