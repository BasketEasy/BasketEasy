import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { AdminPlayerDetail } from '@basketeasy/types/platform-admin-browse';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminPlayerDetailPage } from './AdminPlayerDetailPage';
import { clearPlatformSession, startPlatformSession } from './platformSession';

const PLAYER: AdminPlayerDetail = {
  person: {
    kind: 'player',
    id: 'player-1',
    displayName: 'Léo Bernard',
    email: null,
    emailDomain: null,
    redacted: false,
  },
  club: { id: 'club-1', name: 'BC Nantes Erdre' },
  linkedUserId: null,
  isMinor: true,
  consentState: 'recorded',
  teamCount: 1,
  createdAt: '2026-08-28T10:00:00.000Z',
  birthDate: '2015-03-14T00:00:00.000Z',
  licenseNumber: 'VT150314',
  gender: 'MEN',
  linkedUser: null,
  teams: [],
  guardians: [
    {
      person: {
        kind: 'user',
        id: 'user-5',
        displayName: 'Nicolas Bernard',
        email: 'n.bernard@example.org',
        emailDomain: 'example.org',
        redacted: false,
      },
      linkedAt: '2026-09-03T10:00:00.000Z',
    },
  ],
  guardianInvites: [],
  playerInvite: null,
  consents: [],
};

function renderPlayer(detail: AdminPlayerDetail, role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
  server.use(http.get('/api/admin/players/player-1', () => HttpResponse.json(detail)));
  return renderWithProviders(
    <Routes>
      <Route path="/admin/players/:playerId" element={<AdminPlayerDetailPage />} />
    </Routes>,
    { route: '/admin/players/player-1' },
  );
}

describe('AdminPlayerDetailPage', () => {
  afterEach(() => clearPlatformSession());

  it('shows a DATA_OFFICER the full record, parents linked to their accounts', async () => {
    renderPlayer(PLAYER, 'DATA_OFFICER');

    expect(await screen.findByRole('heading', { name: 'Léo Bernard' })).toBeInTheDocument();
    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Joueurs' })).toHaveAttribute('href', '/admin/players');
    expect(screen.getByText('VT150314')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nicolas Bernard' })).toHaveAttribute(
      'href',
      '/admin/users/user-5',
    );
    expect(screen.getByRole('link', { name: 'Journal d’audit de ce joueur' })).toHaveAttribute(
      'href',
      '/admin/audit-log?playerId=player-1',
    );
  });

  it('tells SUPPORT that birth date and licence are withheld, not missing', async () => {
    renderPlayer(
      {
        ...PLAYER,
        person: { ...PLAYER.person, displayName: 'L. B.', redacted: true },
        birthDate: null,
        licenseNumber: null,
      },
      'SUPPORT',
    );

    expect(await screen.findByRole('heading', { name: 'L. B.' })).toBeInTheDocument();
    expect(screen.getAllByText('Masqué (profil support)')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Journal d’audit/ })).not.toBeInTheDocument();
  });
});
