import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { eventScoresheetStatusQueryKey } from './queryKeys';
import { useEventScoresheetUpload } from './useEventScoresheetUpload';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

const file = new File(['fake-jpeg-bytes'], 'feuille.jpg', { type: 'image/jpeg' });

describe('useEventScoresheetUpload', () => {
  it('runs upload-url → direct R2 PUT → confirm, then writes the confirmed status into the cache', async () => {
    let uploadUrlRequestBody: unknown;
    let putContentType: string | null = null;
    let confirmRequestBody: unknown;
    server.use(
      http.post(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url',
        async ({ request }) => {
          uploadUrlRequestBody = await request.json();
          return HttpResponse.json({
            uploadUrl: 'https://r2.example/upload-target',
            storageKey: 'scoresheets/event-1/abc.jpg',
          });
        },
      ),
      http.put('https://r2.example/upload-target', ({ request }) => {
        putContentType = request.headers.get('content-type');
        return new HttpResponse(null, { status: 200 });
      }),
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet',
        async ({ request }) => {
          confirmRequestBody = await request.json();
          return HttpResponse.json({
            status: 'UPLOADED',
            uploadedByTeamPlayerId: 'tp-1',
            uploadedAt: '2026-01-01T20:00:00.000Z',
          });
        },
      ),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useEventScoresheetUpload('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(uploadUrlRequestBody).toEqual({ contentType: 'image/jpeg' });
    expect(putContentType).toBe('image/jpeg');
    expect(confirmRequestBody).toEqual({ storageKey: 'scoresheets/event-1/abc.jpg' });
    expect(
      queryClient.getQueryData(eventScoresheetStatusQueryKey('club-1', 'team-1', 'event-1')),
    ).toEqual({
      status: 'UPLOADED',
      uploadedByTeamPlayerId: 'tp-1',
      uploadedAt: '2026-01-01T20:00:00.000Z',
    });
  });

  it('surfaces a persistent error when the direct-to-R2 PUT fails, without confirming', async () => {
    let confirmCalled = false;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url', () =>
        HttpResponse.json({
          uploadUrl: 'https://r2.example/upload-target',
          storageKey: 'scoresheets/event-1/abc.jpg',
        }),
      ),
      http.put('https://r2.example/upload-target', () => new HttpResponse(null, { status: 500 })),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () => {
        confirmCalled = true;
        return HttpResponse.json({});
      }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEventScoresheetUpload('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(confirmCalled).toBe(false);
    expect((result.current.error as Error).message).toBe(
      'La connexion a été interrompue. Vérifiez votre réseau et réessayez.',
    );
  });

  it('surfaces an error when the upload-url request itself is rejected (e.g. unsupported content type)', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url', () =>
        HttpResponse.json({ message: 'Format de photo non supporté' }, { status: 400 }),
      ),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEventScoresheetUpload('club-1', 'team-1', 'event-1'), {
      wrapper,
    });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
