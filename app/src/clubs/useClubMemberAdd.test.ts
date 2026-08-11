import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useClubMemberAdd } from './useClubMemberAdd';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, queryClient };
}

describe('useClubMemberAdd', () => {
  it('posts to /clubs/:clubId/members and invalidates the members list cache on success', async () => {
    server.use(
      http.post('/api/clubs/club-1/members', async ({ request }) => {
        const body = (await request.json()) as { email: string };
        return HttpResponse.json({
          userId: 'user-2',
          email: body.email,
          role: 'MEMBER',
          joinedAt: '2026-01-02',
        });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['clubs', 'club-1', 'members', {}], {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const { result } = renderHook(() => useClubMemberAdd('club-1'), { wrapper });

    result.current.mutate({ email: 'a@b.com' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(['clubs', 'club-1', 'members', {}])?.isInvalidated,
    ).toBe(true);
  });
});
