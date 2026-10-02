import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AccountContext } from '../auth/useAccount';
import { useIsTeamManager } from './useIsTeamManager';

function wrapperWithUser(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    const value = {
      user: {
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerified: true,
        emailNotificationsEnabled: true,
        memberships,
      },
      isLoading: false,
      isError: false,
      retry: () => {},
    };
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AccountContext.Provider, { value }, children),
    );
  };
}

// Counts the reads of `GET .../admins`, which answers a member of the club and
// 403s everyone else.
function mockAdmins(userIds: string[]) {
  const counter = { requests: 0 };
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/admins', () => {
      counter.requests += 1;
      return HttpResponse.json(userIds.map((userId) => ({ userId })));
    }),
  );
  return counter;
}

describe('useIsTeamManager', () => {
  afterEach(() => server.resetHandlers());

  it('does not ask the server for the team admins when the user has no membership in the club', async () => {
    // A guardian-only parent: the route refuses them, so the call could only 403.
    const admins = mockAdmins(['user-1']);

    const { result } = renderHook(() => useIsTeamManager('club-1', 'team-1'), {
      wrapper: wrapperWithUser([]),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBe(false);
    expect(admins.requests).toBe(0);
  });

  it('does not treat a membership in another club as a reason to ask', async () => {
    const admins = mockAdmins(['user-1']);

    const { result } = renderHook(() => useIsTeamManager('club-1', 'team-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-2', role: 'MEMBER' }]),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBe(false);
    expect(admins.requests).toBe(0);
  });

  it('is true for a club ADMIN without reading the team admins', async () => {
    const admins = mockAdmins([]);

    const { result } = renderHook(() => useIsTeamManager('club-1', 'team-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'ADMIN' }]),
    });

    expect(result.current).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(admins.requests).toBe(0);
  });

  it('is true for a club member holding a TeamAdmin grant on the team', async () => {
    const admins = mockAdmins(['user-1']);

    const { result } = renderHook(() => useIsTeamManager('club-1', 'team-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'MEMBER' }]),
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(admins.requests).toBe(1);
  });

  it('is false for a club member who is not a TeamAdmin of the team', async () => {
    const admins = mockAdmins(['someone-else']);

    const { result } = renderHook(() => useIsTeamManager('club-1', 'team-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'MEMBER' }]),
    });

    await waitFor(() => expect(admins.requests).toBe(1));
    expect(result.current).toBe(false);
  });
});
