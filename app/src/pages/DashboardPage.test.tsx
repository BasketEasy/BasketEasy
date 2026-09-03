import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { DashboardPage } from './DashboardPage';

function renderLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Chris',
        lastName: 'Rillesen',
        avatarUrl: null,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      }),
    ),
    http.get('/api/clubs', () => HttpResponse.json([{ id: 'club-1', name: 'COC Basket' }])),
  );
  return renderWithProviders(<DashboardPage />);
}

// A plain rostered player: no club-ADMIN membership, no TeamAdmin grant
// anywhere, so `hasManageRights` is false and the leaner tile set renders.
function renderLoggedInAsPlayer() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Chris',
        lastName: 'Rillesen',
        avatarUrl: null,
        memberships: [{ clubId: 'club-1', role: 'MEMBER' }],
      }),
    ),
    http.get('/api/clubs', () => HttpResponse.json([{ id: 'club-1', name: 'COC Basket' }])),
    http.get('/api/me/teams', () =>
      HttpResponse.json([
        {
          teamId: 'team-1',
          teamName: 'U15 Filles',
          category: 'U15',
          gender: 'WOMEN',
          clubId: 'club-1',
          clubName: 'COC Basket',
          isTeamAdmin: false,
          rosterRole: 'PLAYER',
        },
      ]),
    ),
  );
  return renderWithProviders(<DashboardPage />);
}

describe('DashboardPage', () => {
  it('greets the logged-in user by first name and shows their email', async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('Bonjour, Chris')).toBeInTheDocument());
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows stat tiles computed from teams, admin clubs, and the dashboard summary', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Filles',
            category: 'U15',
            gender: 'WOMEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
          {
            teamId: 'team-2',
            teamName: 'U18 Garçons',
            category: 'U18',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 24,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    // One managed team (isTeamAdmin: true), one admin club, 24 players, 1 event.
    await waitFor(() => expect(screen.getByText('24')).toBeInTheDocument());
    const statValues = screen.getAllByText(/^\d+$/).map((el) => el.textContent);
    expect(statValues).toEqual(expect.arrayContaining(['1', '24']));
    expect(screen.getByText('Clubs administrés')).toBeInTheDocument();
  });

  it('shows the agenda strip with upcoming events, linking into the team', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByText(/Gymnase A/)).toBeInTheDocument();
    expect(screen.getByText('Match')).toBeInTheDocument();
  });

  it('shows an empty state when there are no events in the next 7 days', async () => {
    renderLoggedIn();

    await waitFor(() =>
      expect(screen.getByText('Rien de prévu cette semaine')).toBeInTheDocument(),
    );
  });

  it('shows team cards for teams the user is part of', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Filles',
            category: 'U15',
            gender: 'WOMEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
    );
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /voir l.équipe/i })).toBeInTheDocument();
  });

  it('links an agenda row straight to the event, not to the team page', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    const row = await screen.findByRole('link', { name: /U15 Filles/ });
    expect(row).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-1');
  });

  it('shows an empty state when the user has no teams', async () => {
    renderLoggedIn();

    await waitFor(() =>
      expect(screen.getByText('Aucune équipe pour le moment')).toBeInTheDocument(),
    );
  });

  it('shows a leaner two-tile view and hides the admin-only tiles for a plain rostered player', async () => {
    renderLoggedInAsPlayer();

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByText('Événements — 7 prochains jours')).toBeInTheDocument();
    expect(screen.getByText('En attente de réponse')).toBeInTheDocument();
    expect(screen.queryByText('Équipes gérées')).not.toBeInTheDocument();
    expect(screen.queryByText('Joueurs au total')).not.toBeInTheDocument();
    expect(screen.queryByText('Clubs administrés')).not.toBeInTheDocument();
  });

  it("shows the player's roster role on their team card", async () => {
    renderLoggedInAsPlayer();

    expect(await screen.findByText('Joueur')).toBeInTheDocument();
  });

  it('shows the RSVP control and convocation badge on an agenda event, and counts events awaiting a response', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: 'Les Aigles',
              myRsvpStatus: null,
              myConvocation: true,
            },
            {
              eventId: 'event-2',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'TRAINING',
              startsAt: '2026-08-13T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: null,
              myRsvpStatus: 'GOING',
              myConvocation: false,
            },
          ],
        }),
      ),
    );
    renderLoggedInAsPlayer();

    expect(await screen.findByText('Convoqué')).toBeInTheDocument();
    expect(screen.getByText(/vs Les Aigles/)).toBeInTheDocument();

    // One control per rostered row, each reflecting that row's own answer.
    const [unanswered, answered] = screen.getAllByRole('group', { name: 'Ma réponse' });
    expect(within(unanswered).getByRole('button', { name: 'Présent' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      within(answered).getByRole('button', { name: 'Présent', pressed: true }),
    ).toBeInTheDocument();

    // Only event-1 is unanswered — event-2 already has a RSVP.
    const statValues = screen.getAllByText(/^\d+$/).map((el) => el.textContent);
    expect(statValues).toEqual(expect.arrayContaining(['2', '1']));
  });
  it('lets a rostered player answer an agenda event without leaving the home screen', async () => {
    let requestBody: unknown;
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: 'Les Aigles',
              myRsvpStatus: null,
              myConvocation: true,
            },
          ],
        }),
      ),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ id: 'event-1', myRsvpStatus: 'GOING' });
      }),
    );
    renderLoggedInAsPlayer();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    await waitFor(() => expect(requestBody).toEqual({ status: 'GOING' }));
  });

  it('shows no RSVP control to a manager who is not on the event team roster', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Filles',
            category: 'U15',
            gender: 'WOMEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: 'Les Aigles',
              myRsvpStatus: null,
              myConvocation: false,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    await screen.findByRole('link', { name: /U15 Filles/ });
    expect(screen.queryByRole('group', { name: 'Ma réponse' })).not.toBeInTheDocument();
  });

  it('shows an error, not an empty state, when the agenda fails to load', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );
    renderLoggedIn();

    expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();
    expect(screen.queryByText('Rien de prévu cette semaine')).not.toBeInTheDocument();
  });
});
