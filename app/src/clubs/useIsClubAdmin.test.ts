import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AccountContext } from '../auth/useAccount';
import { useIsClubAdmin } from './useIsClubAdmin';

function wrapperWithUser(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const value = memberships
      ? {
          user: {
            id: 'user-1',
            email: 'a@b.com',
            firstName: null,
            lastName: null,
            avatarUrl: null,
            memberships,
          },
          isLoading: false,
        }
      : { user: null, isLoading: false };
    return createElement(AccountContext.Provider, { value }, children);
  };
}

describe('useIsClubAdmin', () => {
  it('returns true when the user is ADMIN of the given club', () => {
    const { result } = renderHook(() => useIsClubAdmin('club-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'ADMIN' }]),
    });
    expect(result.current).toBe(true);
  });

  it('returns false when the user is only a MEMBER of the given club', () => {
    const { result } = renderHook(() => useIsClubAdmin('club-1'), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'MEMBER' }]),
    });
    expect(result.current).toBe(false);
  });

  it('returns false when there is no logged-in user', () => {
    const { result } = renderHook(() => useIsClubAdmin('club-1'), {
      wrapper: wrapperWithUser(null),
    });
    expect(result.current).toBe(false);
  });

  it('returns false when clubId is undefined', () => {
    const { result } = renderHook(() => useIsClubAdmin(undefined), {
      wrapper: wrapperWithUser([{ clubId: 'club-1', role: 'ADMIN' }]),
    });
    expect(result.current).toBe(false);
  });
});
