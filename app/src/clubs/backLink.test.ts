import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useBackLink } from './backLink';

function wrapperWithEntries(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries }, children);
  };
}

describe('useBackLink', () => {
  it('returns to the club roster when that is where the user came from', () => {
    const { result } = renderHook(() => useBackLink(), {
      wrapper: wrapperWithEntries([
        {
          pathname: '/clubs/c1/teams/t1',
          state: { origin: { from: 'members', clubId: 'c1' } },
        },
      ]),
    });
    expect(result.current).toEqual({
      to: '/clubs/c1/members?tab=teams',
      label: '← Effectif du club',
    });
  });

  it('returns to the dashboard when that is where the user came from', () => {
    const { result } = renderHook(() => useBackLink(), {
      wrapper: wrapperWithEntries([
        {
          pathname: '/clubs/c1/teams/t1',
          state: { origin: { from: 'dashboard' } },
        },
      ]),
    });
    expect(result.current).toEqual({ to: '/dashboard', label: '← Tableau de bord' });
  });

  it('falls back to Mes équipes on a direct link or refresh', () => {
    const { result } = renderHook(() => useBackLink(), {
      wrapper: wrapperWithEntries(['/clubs/c1/teams/t1']),
    });
    expect(result.current).toEqual({ to: '/my-teams', label: '← Mes équipes' });
  });
});
