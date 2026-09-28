import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { AdminRosterEntry, AdminTeamDetail } from '@basketeasy/types/platform-admin-browse';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminTeamDetailPage } from './AdminTeamDetailPage';

const TEAM: AdminTeamDetail = {
  id: 'team-1',
  name: 'U13 F CTC',
  category: 'U13',
  gender: 'WOMEN',
  createdAt: '2026-08-28T10:00:00.000Z',
  ownerClub: { id: 'club-1', name: 'BC Nantes Erdre' },
  partnerClubs: [{ id: 'club-2', name: 'ES Carquefou' }],
  rosterCount: 1,
  teamAdminCount: 0,
  teamAdmins: [],
  ffbbLinks: [],
};

const ROSTER: AdminRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    player: {
      kind: 'player',
      id: 'player-1',
      displayName: 'Lina Bouvier',
      email: null,
      emailDomain: null,
      redacted: false,
    },
    club: { id: 'club-2', name: 'ES Carquefou' },
    role: 'PLAYER',
    linkedUser: null,
    joinedAt: '2026-09-01T10:00:00.000Z',
  },
];

describe('AdminTeamDetailPage', () => {
  it('shows the owning and partner clubs and links the roster to player records', async () => {
    server.use(
      http.get('/api/admin/teams/team-1', () => HttpResponse.json(TEAM)),
      http.get('/api/admin/teams/team-1/roster', () => HttpResponse.json(ROSTER)),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin/teams/:teamId" element={<AdminTeamDetailPage />} />
      </Routes>,
      { route: '/admin/teams/team-1' },
    );

    expect(await screen.findByRole('heading', { name: 'U13 F CTC' })).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.getByText('Partenaire')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Lina Bouvier' })).toHaveAttribute(
      'href',
      '/admin/players/player-1',
    );
    expect(screen.getByRole('link', { name: 'Comptes liés à l’équipe' })).toHaveAttribute(
      'href',
      '/admin/users?teamId=team-1',
    );
  });
});
