import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { AdminClubDetail } from '@basketeasy/types/platform-admin-browse';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminClubDetailPage } from './AdminClubDetailPage';
import { clearPlatformSession, startPlatformSession } from './platformSession';

const CLUB: AdminClubDetail = {
  id: 'club-1',
  name: 'BC Nantes Erdre',
  ffbbClubCode: 'PDL0044012',
  createdAt: '2024-09-04T10:00:00.000Z',
  memberCount: 2,
  adminCount: 1,
  teamCount: 3,
  playerCount: 40,
  meetingPointName: null,
  meetingPointAddress: null,
  arrivalBufferMinutes: 45,
};

function renderClub(route = '/admin/clubs/club-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/clubs/:clubId" element={<AdminClubDetailPage />} />
      <Route path="/admin/clubs" element={<p>Liste des clubs</p>} />
    </Routes>,
    { route },
  );
}

function serveClub() {
  server.use(
    http.get('/api/admin/clubs/club-1', () => HttpResponse.json(CLUB)),
    http.get('/api/admin/clubs/club-1/members', () =>
      HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
    ),
  );
}

function signInAs(role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
}

describe('AdminClubDetailPage', () => {
  afterEach(() => clearPlatformSession());

  it('opens on the members tab, each member linking to their account', async () => {
    server.use(
      http.get('/api/admin/clubs/club-1', () => HttpResponse.json(CLUB)),
      http.get('/api/admin/clubs/club-1/members', () =>
        HttpResponse.json({
          items: [
            {
              person: {
                kind: 'user',
                id: 'user-1',
                displayName: 'Julie Roux',
                email: 'julie@example.org',
                emailDomain: 'example.org',
                redacted: false,
              },
              role: 'ADMIN',
              joinedAt: '2024-09-04T10:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
      ),
    );

    renderClub();

    expect(await screen.findByRole('heading', { name: 'BC Nantes Erdre' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Julie Roux' })).toHaveAttribute(
      'href',
      '/admin/users/user-1',
    );
    expect(screen.getByRole('tab', { name: 'Membres' })).toHaveAttribute('aria-selected', 'true');
  });

  it("scopes the teams tab to this club's teams", async () => {
    let teamsQuery: URLSearchParams | null = null;
    server.use(
      http.get('/api/admin/clubs/club-1', () => HttpResponse.json(CLUB)),
      http.get('/api/admin/clubs/club-1/members', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
      http.get('/api/admin/teams', ({ request }) => {
        teamsQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 });
      }),
    );
    const user = userEvent.setup();

    renderClub();
    await user.click(await screen.findByRole('tab', { name: 'Équipes' }));

    expect(await screen.findByText('Aucune équipe')).toBeInTheDocument();
    expect(teamsQuery!.get('clubId')).toBe('club-1');
  });

  it('shows the error branch for a club that fails to load', async () => {
    server.use(http.get('/api/admin/clubs/club-1', () => HttpResponse.json({}, { status: 404 })));

    renderClub();

    expect(await screen.findByText('Club indisponible')).toBeInTheDocument();
  });

  it('offers club deletion to a DATA_OFFICER only', async () => {
    serveClub();
    signInAs('SUPPORT');

    renderClub();

    expect(await screen.findByRole('heading', { name: 'BC Nantes Erdre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('deletes the club with a reason, then leaves for the clubs list', async () => {
    serveClub();
    let body: unknown = null;
    server.use(
      http.post('/api/admin/clubs/club-1/delete', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ action: 'CLUB_DELETED', auditLogId: 'log-1' });
      }),
    );
    signInAs('DATA_OFFICER');
    const user = userEvent.setup();

    renderClub();
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    await user.type(screen.getByLabelText('Motif'), 'Club dissous, ticket #42');
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));

    expect(await screen.findByText('Liste des clubs')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'Club dissous, ticket #42' });
  });
});
