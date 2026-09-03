import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { DashboardPage } from './DashboardPage';

/** Days between a request's `from` and `to` query params. */
function requestSpanDays(url: URL): number {
  const from = new Date(url.searchParams.get('from')!);
  const to = new Date(url.searchParams.get('to')!);
  return (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
}

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
// anywhere, so `hasManageRights` is false and the player's "Ma semaine" view
// renders.
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

describe('DashboardPage — manager view', () => {
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

  it('requests the plain 7-day server default, not a widened window', async () => {
    let requestUrl: URL | undefined;
    server.use(
      http.get('/api/me/dashboard', ({ request }) => {
        requestUrl = new URL(request.url);
        return HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] });
      }),
    );
    renderLoggedIn();

    await waitFor(() => expect(requestUrl).toBeDefined());
    expect(requestUrl!.searchParams.get('from')).toBeNull();
    expect(requestUrl!.searchParams.get('to')).toBeNull();
  });

  it('shows the agenda strip with upcoming events, linking into the event', async () => {
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

  it('shows an empty state when the user has no teams', async () => {
    renderLoggedIn();

    await waitFor(() =>
      expect(screen.getByText('Aucune équipe pour le moment')).toBeInTheDocument(),
    );
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

describe('DashboardPage — player view (« Ma semaine »)', () => {
  it('greets the player without showing their e-mail or any stat tile', async () => {
    renderLoggedInAsPlayer();

    await waitFor(() => expect(screen.getByText('Bonjour, Chris')).toBeInTheDocument());
    expect(screen.queryByText('a@b.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Équipes gérées')).not.toBeInTheDocument();
    expect(screen.queryByText('Joueurs au total')).not.toBeInTheDocument();
    expect(screen.queryByText('En attente de réponse')).not.toBeInTheDocument();
  });

  it("doesn't show the team-card grid — the bottom nav's team tab owns that now", async () => {
    renderLoggedInAsPlayer();

    await waitFor(() => expect(screen.getByText('Prochain rendez-vous')).toBeInTheDocument());
    expect(screen.queryByText('Voir l’équipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Mes équipes')).not.toBeInTheDocument();
  });

  it('requests a 14-day window, not the server’s 7-day default', async () => {
    let forwardRequestUrl: URL | undefined;
    server.use(
      http.get('/api/me/dashboard', ({ request }) => {
        const url = new URL(request.url);
        const spanDays = requestSpanDays(url);
        // The player home also fires a second, past-looking query for
        // « Après le match » (~30 days) — only capture the forward one.
        if (spanDays < 20) {
          forwardRequestUrl = url;
        }
        return HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] });
      }),
    );
    renderLoggedInAsPlayer();

    await waitFor(() => expect(forwardRequestUrl).toBeDefined());
    expect(requestSpanDays(forwardRequestUrl!)).toBeCloseTo(14, 1);
  });

  it('shows the next event as a prominent hero card', async () => {
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
    );
    renderLoggedInAsPlayer();

    // The « Prochain rendez-vous » heading renders immediately, before the
    // query settles — wait on the data itself, not the (always-present)
    // heading above it.
    await screen.findByText('vs Les Aigles');
    expect(screen.getAllByText('Convoqué').length).toBeGreaterThan(0);
  });

  it('shows an empty state under the hero when nothing is upcoming', async () => {
    renderLoggedInAsPlayer();

    await waitFor(() => expect(screen.getByText('Rien de prévu')).toBeInTheDocument());
    expect(screen.queryByText('À répondre')).not.toBeInTheDocument();
  });

  it('lists unanswered events under « À répondre (n) », convocations first', async () => {
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
              type: 'TRAINING',
              startsAt: '2026-08-11T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: null,
              myRsvpStatus: null,
              myConvocation: false,
            },
            {
              eventId: 'event-2',
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
              eventId: 'event-3',
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

    const heading = await screen.findByText('À répondre (2)');
    const section = heading.closest('section')!;
    // Convoked match (event-2) leads even though event-1 starts earlier.
    const groups = within(section).getAllByRole('group', { name: 'Ma réponse' });
    expect(groups).toHaveLength(2);
    expect(within(section).getByText(/vs Les Aigles/)).toBeInTheDocument();
  });

  it('vanishes « À répondre » once nothing is outstanding — the one empty state that is good news', async () => {
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
              type: 'TRAINING',
              startsAt: '2026-08-11T18:00:00.000Z',
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

    await waitFor(() => expect(screen.getByText('Les 14 prochains jours')).toBeInTheDocument());
    expect(screen.queryByText(/À répondre/)).not.toBeInTheDocument();
  });

  it('lists every upcoming event under « Les 14 prochains jours » with inline RSVP', async () => {
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
              type: 'TRAINING',
              startsAt: '2026-08-11T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: null,
              myRsvpStatus: 'GOING',
              myConvocation: false,
            },
            {
              eventId: 'event-2',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'MATCH',
              startsAt: '2026-08-20T18:00:00.000Z',
              location: 'Gymnase B',
              notes: null,
              opponentName: 'Orvault',
              myRsvpStatus: null,
              myConvocation: false,
            },
          ],
        }),
      ),
    );
    renderLoggedInAsPlayer();

    const heading = await screen.findByText('Les 14 prochains jours');
    const section = heading.closest('section')!;
    expect(within(section).getAllByRole('group', { name: 'Ma réponse' })).toHaveLength(2);
    expect(within(section).getByText(/vs Orvault/)).toBeInTheDocument();
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
    const buttons = await screen.findAllByRole('button', { name: 'Présent' });
    await user.click(buttons[0]);

    await waitFor(() => expect(requestBody).toEqual({ status: 'GOING' }));
  });

  it('shows an error, not an empty state, when the agenda fails to load', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );
    renderLoggedInAsPlayer();

    // Both the forward and the past-matches query hit the same failing
    // handler, so the error renders once in the hero and once in « Après le
    // match ».
    await waitFor(() =>
      expect(screen.getAllByText('Chargement impossible').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('Rien de prévu')).not.toBeInTheDocument();
  });

  it('shows nothing under « Après le match » when there is no recent match', async () => {
    renderLoggedInAsPlayer();

    // The heading renders transiently while its own query is still loading
    // (skeleton underneath) — wait for every "status" region to clear before
    // asserting the settled, steady-state absence.
    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
    expect(screen.queryByText('Après le match')).not.toBeInTheDocument();
  });

  it('shows a played match under « Après le match », linking to the event', async () => {
    server.use(
      http.get('/api/me/dashboard', ({ request }) => {
        const url = new URL(request.url);
        // The past-matches query spans ~30 days, the forward one ~14 —
        // tell them apart by span rather than by comparing to "now" (which
        // races against the moment this handler runs).
        const isPastQuery = requestSpanDays(url) > 20;
        return HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: isPastQuery
            ? [
                {
                  eventId: 'event-past',
                  teamId: 'team-1',
                  teamName: 'U15 Filles',
                  clubId: 'club-1',
                  clubName: 'COC Basket',
                  type: 'MATCH',
                  startsAt: '2026-08-01T18:00:00.000Z',
                  location: 'Gymnase A',
                  notes: null,
                  opponentName: 'Vertou',
                  myRsvpStatus: 'GOING',
                  myConvocation: true,
                },
              ]
            : [],
        });
      }),
    );
    renderLoggedInAsPlayer();

    await screen.findByText(/vs Vertou/);
  });

  it('shows an error, not silence, when the past-matches query fails', async () => {
    server.use(
      http.get('/api/me/dashboard', ({ request }) => {
        const url = new URL(request.url);
        if (requestSpanDays(url) > 20) {
          return HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 });
        }
        return HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              type: 'TRAINING',
              startsAt: '2026-08-11T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: null,
              myRsvpStatus: 'GOING',
              myConvocation: false,
            },
          ],
        });
      }),
    );
    renderLoggedInAsPlayer();

    await waitFor(() =>
      expect(screen.getAllByText('Chargement impossible').length).toBeGreaterThan(0),
    );
  });
});
