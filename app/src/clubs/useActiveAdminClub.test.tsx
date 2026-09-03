import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ActiveClubContext } from '../auth/useActiveClub';
import { useActiveAdminClub } from './useActiveAdminClub';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'lea@example.fr', memberships }),
    ),
    http.get('/api/clubs', () =>
      HttpResponse.json([
        { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
        { id: 'club-9', name: 'Rezé Basket', createdAt: '2026-01-01' },
      ]),
    ),
  );
}

function Probe() {
  const { activeClub, activeClubId } = useActiveAdminClub();
  return (
    <p data-testid="probe">{activeClubId ? `${activeClubId}:${activeClub?.name}` : 'aucun'}</p>
  );
}

/** Renders the probe under a context that already holds `heldClubId`. */
function renderWithHeldClub(heldClubId: string | null) {
  return renderWithProviders(
    <ActiveClubContext.Provider value={{ activeClubId: heldClubId, setActiveClubId: () => {} }}>
      <Probe />
    </ActiveClubContext.Provider>,
  );
}

describe('useActiveAdminClub', () => {
  it('resolves the club the context holds when the caller administers it', async () => {
    mockSession([{ clubId: 'club-9', role: 'ADMIN' }]);

    renderWithHeldClub('club-9');

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('club-9:Rezé Basket'),
    );
  });

  it('ignores an id the caller has no admin rights on', async () => {
    // The shape a logout leaves behind: ActiveClubProvider sits above the
    // router and is never unmounted, so the previous admin's club id is
    // still in context when a plain player signs in in the same tab. Reading
    // it straight would offer them a club roster that answers 403.
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);

    renderWithHeldClub('club-9');

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('aucun'));
    // And it stays that way — no late resolution to the held club.
    expect(screen.getByTestId('probe')).toHaveTextContent('aucun');
  });

  it('falls back to the first admin club before the provider has selected one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);

    renderWithHeldClub(null);

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('club-1:COC Basket'));
  });
});
