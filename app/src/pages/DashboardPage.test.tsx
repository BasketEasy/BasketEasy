import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { DashboardPage } from './DashboardPage';
import { ActingAsProvider } from '../guardians/ActingAsContext';
import { Toaster } from '@basketeasy/ui/toaster';
import { __resetToastsForTests } from '@basketeasy/ui/toast-store';

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
        emailVerified: true,
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
function renderLoggedInAsPlayerSetup() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        emailVerified: true,
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
}

function renderLoggedInAsPlayer() {
  renderLoggedInAsPlayerSetup();
  return renderWithProviders(<DashboardPage />);
}

describe('DashboardPage — manager view', () => {
  it('greets the logged-in user by first name and shows their email', async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('Bonjour, Chris')).toBeInTheDocument());
    // The e-mail line only renders once hasManageRights resolves (it's
    // manager-only), which itself waits on GET /clubs — a query that in turn
    // waits on the session restore, so it lands a render or two after the
    // greeting rather than in the same one.
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
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
              rsvpSummary: {
                rosterSize: 0,
                convoked: 0,
                answering: 0,
                going: 0,
                maybe: 0,
                notGoing: 0,
                pending: 0,
                isConvocationScoped: false,
              },
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

    // The very first request can still be the player-windowed one, fired
    // before hasManageRights resolves — wait for the manager-mode refetch
    // (no from/to) that follows once GET /clubs answers, rather than
    // asserting on whichever request happened to land first.
    await waitFor(() => expect(requestUrl?.searchParams.get('from')).toBeNull());
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
              rsvpSummary: {
                rosterSize: 0,
                convoked: 0,
                answering: 0,
                going: 0,
                maybe: 0,
                notGoing: 0,
                pending: 0,
                isConvocationScoped: false,
              },
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    const row = await screen.findByRole('link', { name: /U15 Filles/ });
    expect(row).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-1');
    // Once on the type badge, once on the card's time block.
    expect(screen.getAllByText('Match')).toHaveLength(2);
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

    const row = await screen.findByRole('link', { name: /U15 Filles/ });
    expect(row).toHaveAttribute('href', '/clubs/club-1/teams/team-1');
    expect(within(row).getByText('COC Basket · U15')).toBeInTheDocument();
    expect(within(row).getByText('Administrateur')).toBeInTheDocument();
  });

  it('puts « Cette semaine » and « Mes équipes » on the court line, as h2 sections', async () => {
    renderLoggedIn();

    expect(await screen.findByRole('heading', { level: 2, name: 'Cette semaine' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Mes équipes' })).toBeVisible();
  });

  it('links « Voir le calendrier » to the teams list', async () => {
    renderLoggedIn();

    expect(await screen.findByRole('link', { name: /voir le calendrier/i })).toHaveAttribute(
      'href',
      '/my-teams',
    );
  });

  it('lists « À traiter » as tiles, accent for what only the manager can fix', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [],
          actionItems: [
            {
              kind: 'MATCH_WITHOUT_CONVOCATIONS',
              clubId: 'club-1',
              clubName: 'COC Basket',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              eventId: 'event-1',
              message: 'Match sans convocation',
            },
            {
              kind: 'EVENT_PENDING_RSVPS',
              clubId: 'club-1',
              clubName: 'COC Basket',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              eventId: 'event-2',
              message: 'Réponses en attente',
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    const heading = await screen.findByRole('heading', { level: 2, name: 'À traiter (2)' });
    const section = heading.closest('section')!;
    const tiles = section.querySelectorAll('[data-tone]');
    expect(Array.from(tiles).map((tile) => tile.getAttribute('data-tone'))).toEqual([
      'accent',
      'neutral',
    ]);
    expect(within(section).getByRole('button', { name: 'Convoquer le groupe' })).toBeVisible();
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
              rsvpSummary: {
                rosterSize: 0,
                convoked: 0,
                answering: 0,
                going: 0,
                maybe: 0,
                notGoing: 0,
                pending: 0,
                isConvocationScoped: false,
              },
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

    // Two independent queries hit the same failing endpoint here: "Cette
    // semaine" and, since phase 8, ManagerHome's own "Après le match" —
    // both surface their own error, not a shared one. The manager-only
    // second one only mounts once hasManageRights resolves, so wait for the
    // full count rather than whichever renders first.
    await waitFor(() => expect(screen.getAllByText('Chargement impossible')).toHaveLength(2));
    expect(screen.queryByText('Rien de prévu cette semaine')).not.toBeInTheDocument();
  });
});

// The player home fires two dashboard queries: the 14-day forward agenda and
// the 30-day past window. Tell them apart by span, not by comparing to "now".
function mockAgenda({ upcoming = [], past = [] }: { upcoming?: unknown[]; past?: unknown[] }) {
  server.use(
    http.get('/api/me/dashboard', ({ request }) =>
      HttpResponse.json({
        totalPlayers: 0,
        upcomingEvents: requestSpanDays(new URL(request.url)) > 20 ? past : upcoming,
      }),
    ),
  );
}

const ZERO_SUMMARY = {
  rosterSize: 0,
  convoked: 0,
  answering: 0,
  going: 0,
  maybe: 0,
  notGoing: 0,
  pending: 0,
  isConvocationScoped: false,
};

function agendaEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    teamId: 'team-1',
    teamName: 'U15 Filles',
    clubId: 'club-1',
    clubName: 'COC Basket',
    type: 'MATCH',
    startsAt: '2026-10-10T18:00:00.000Z',
    location: 'Gymnase A',
    locationName: null,
    notes: null,
    opponentName: 'Les Aigles',
    venue: 'AWAY',
    recurrenceId: null,
    myRsvpStatus: null,
    myRsvpRespondedBy: null,
    myRsvpRespondedAt: null,
    myConvocation: false,
    rsvpSummary: ZERO_SUMMARY,
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    result: null,
    myMatchStats: null,
    vote: null,
    meetingPlan: null,
    myTravelMode: null,
    ...overrides,
  };
}

const MEETING_PLAN = {
  arrivalAt: '2026-10-10T17:15:00.000Z',
  arrivalBufferMinutes: 45,
  meetingPoint: { name: 'Parking Coubertin', address: '12 rue Coubertin, Nantes' },
  meetingPointSource: 'TEAM',
  defaultMeetingPoint: null,
  defaultMeetingPointSource: null,
  travelMinutes: 30,
  travelMinutesSource: 'COMPUTED',
  meetsAt: '2026-10-10T16:45:00.000Z',
  meetsAtSource: 'COMPUTED',
};

const OPEN_VOTE = {
  canVote: true,
  hasVoted: false,
  closesAt: '2026-10-03T18:00:00.000Z',
  votesCast: 6,
  totalVoters: 12,
  mvp: null,
};

function playedMatch(overrides: Record<string, unknown> = {}) {
  return agendaEvent({
    eventId: 'event-past',
    startsAt: '2026-09-28T18:00:00.000Z',
    opponentName: 'Carquefou',
    myRsvpStatus: 'GOING',
    myConvocation: true,
    result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
    myMatchStats: { points: 14, fouls: 2 },
    vote: OPEN_VOTE,
    ...overrides,
  });
}

function seasonRow(overrides: Record<string, unknown> = {}) {
  return {
    teamPlayerId: 'tp-me',
    firstName: 'Chris',
    lastName: 'Rillesen',
    role: 'PLAYER',
    gamesPlayed: 5,
    pointsPerGame: 11.4,
    foulsPerGame: 2,
    seasonHighPoints: 19,
    seasonHighFouls: 4,
    freeThrowPoints: 7,
    twoPointPoints: 40,
    threePointPoints: 10,
    totalPoints: 57,
    mvpAwards: 2,
    worstPlayerAwards: 1,
    isMe: true,
    ...overrides,
  };
}

function mockSeason(players: unknown[] | 'error') {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/stats', () =>
      players === 'error'
        ? HttpResponse.json({ message: 'Erreur' }, { status: 500 })
        : HttpResponse.json({
            seasonYear: 2026,
            seasonStart: '2026-09-01T00:00:00.000Z',
            seasonEnd: '2027-08-31T23:59:59.999Z',
            matchesPlayed: 5,
            availableSeasons: [2026],
            players,
          }),
    ),
  );
}

describe('DashboardPage — player view (« Ma semaine »)', () => {
  beforeEach(() => {
    __resetToastsForTests();
    mockSeason([seasonRow({ gamesPlayed: 0, pointsPerGame: null, seasonHighPoints: null })]);
  });

  it('greets the player in the one h1, without their e-mail or any stat tile', async () => {
    renderLoggedInAsPlayer();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bonjour, Chris' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('a@b.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Équipes gérées')).not.toBeInTheDocument();
    expect(screen.queryByText('Joueurs au total')).not.toBeInTheDocument();
  });

  it('requests a 14-day window, not the server’s 7-day default', async () => {
    let forwardRequestUrl: URL | undefined;
    server.use(
      http.get('/api/me/dashboard', ({ request }) => {
        const url = new URL(request.url);
        if (requestSpanDays(url) < 20) forwardRequestUrl = url;
        return HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] });
      }),
    );
    renderLoggedInAsPlayer();

    await waitFor(() => expect(forwardRequestUrl).toBeDefined());
    expect(requestSpanDays(forwardRequestUrl!)).toBeCloseTo(14, 1);
  });

  describe('Prochain rendez-vous', () => {
    it('shows the next event as the hero: team eyebrow, h2 title, venue tile', async () => {
      mockAgenda({
        upcoming: [agendaEvent({ myConvocation: true, locationName: 'Salle Coubertin' })],
      });
      renderLoggedInAsPlayer();

      expect(
        await screen.findByRole('heading', { level: 2, name: 'vs Les Aigles' }),
      ).toBeInTheDocument();
      expect(screen.getAllByText('Convoqué').length).toBeGreaterThan(0);
      expect(screen.getByText('Salle Coubertin')).toBeInTheDocument();
    });

    it('shows an empty state when nothing is upcoming', async () => {
      renderLoggedInAsPlayer();

      expect(await screen.findByText('Rien de prévu')).toBeInTheDocument();
      expect(screen.queryByText(/À faire/)).not.toBeInTheDocument();
    });

    it('shows an error, not an empty state, when the agenda fails to load', async () => {
      server.use(
        http.get('/api/me/dashboard', () =>
          HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
        ),
      );
      renderLoggedInAsPlayer();

      await waitFor(() =>
        expect(screen.getAllByText('Chargement impossible').length).toBeGreaterThan(0),
      );
      expect(screen.queryByText('Rien de prévu')).not.toBeInTheDocument();
    });

    it('shows the RDV line before the player answers, and no travel choice yet', async () => {
      mockAgenda({ upcoming: [agendaEvent({ meetingPlan: MEETING_PLAN })] });
      renderLoggedInAsPlayer();

      expect(await screen.findByText(/RDV \d\d:\d\d · Parking Coubertin/)).toBeInTheDocument();
      expect(screen.queryByText(/Comment venez-vous/)).not.toBeInTheDocument();
    });

    it('asks « Comment venez-vous ? » once the player is going, and records the choice', async () => {
      let body: unknown;
      mockAgenda({
        upcoming: [
          agendaEvent({
            meetingPlan: MEETING_PLAN,
            myRsvpStatus: 'GOING',
            myTravelMode: 'MEETING_POINT',
          }),
        ],
      });
      server.use(
        http.patch(
          '/api/clubs/club-1/teams/team-1/events/event-1/travel-mode',
          async ({ request }) => {
            body = await request.json();
            return HttpResponse.json({ id: 'event-1' });
          },
        ),
      );
      renderLoggedInAsPlayer();
      const user = userEvent.setup();

      const direct = await screen.findByRole('radio', { name: /Directement à la salle/ });
      await user.click(direct);

      await waitFor(() => expect(body).toEqual({ travelMode: 'DIRECT' }));
    });

    it('snaps back and toasts when the travel choice fails', async () => {
      mockAgenda({
        upcoming: [
          agendaEvent({
            meetingPlan: MEETING_PLAN,
            myRsvpStatus: 'GOING',
            myTravelMode: 'MEETING_POINT',
          }),
        ],
      });
      server.use(
        http.patch('/api/clubs/club-1/teams/team-1/events/event-1/travel-mode', () =>
          HttpResponse.json({ message: 'Erreur' }, { status: 500 }),
        ),
      );
      renderLoggedInAsPlayerSetup();
      renderWithProviders(
        <>
          <DashboardPage />
          <Toaster />
        </>,
      );
      const user = userEvent.setup();

      const direct = await screen.findByRole('radio', { name: /Directement à la salle/ });
      await user.click(direct);

      await waitFor(() =>
        expect(screen.getByRole('radio', { name: /Avec le groupe/ })).toHaveAttribute(
          'aria-checked',
          'true',
        ),
      );
      expect(await screen.findByRole('status')).toBeInTheDocument();
    });

    it.each([
      [
        'a NOT_GOING answer',
        { myRsvpStatus: 'NOT_GOING', myTravelMode: null, meetingPlan: MEETING_PLAN },
      ],
      [
        'a match with no meeting point',
        {
          myRsvpStatus: 'GOING',
          myTravelMode: 'MEETING_POINT',
          meetingPlan: { ...MEETING_PLAN, meetingPoint: null, meetsAt: null },
        },
      ],
      ['a training', { type: 'TRAINING', opponentName: null, myRsvpStatus: 'GOING' }],
    ])('offers no travel choice for %s', async (_label, overrides) => {
      mockAgenda({ upcoming: [agendaEvent(overrides)] });
      renderLoggedInAsPlayer();

      await screen.findAllByRole('group', { name: 'Ma réponse' });
      expect(screen.queryByText(/Comment venez-vous/)).not.toBeInTheDocument();
    });
  });

  describe('À faire', () => {
    it('lists unanswered events, convocations first', async () => {
      mockAgenda({
        upcoming: [
          agendaEvent({
            eventId: 'event-0',
            type: 'TRAINING',
            opponentName: null,
            myRsvpStatus: 'GOING',
            startsAt: '2026-10-09T18:00:00.000Z',
          }),
          agendaEvent({
            eventId: 'event-1',
            type: 'TRAINING',
            opponentName: null,
            startsAt: '2026-10-10T18:00:00.000Z',
          }),
          agendaEvent({
            eventId: 'event-2',
            myConvocation: true,
            startsAt: '2026-10-11T18:00:00.000Z',
          }),
        ],
      });
      renderLoggedInAsPlayer();

      const heading = await screen.findByRole('heading', { name: 'À faire (2)' });
      const section = heading.closest('section')!;
      expect(within(section).getAllByRole('group', { name: 'Ma réponse' })).toHaveLength(2);
      expect(within(section).getAllByRole('link')[0]).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-2',
      );
    });

    it('flags a vote the player owes as an accent tile linking to the vote', async () => {
      mockAgenda({ past: [playedMatch()] });
      renderLoggedInAsPlayer();

      const heading = await screen.findByRole('heading', { name: 'À faire (1)' });
      const section = heading.closest('section')!;
      expect(within(section).getByText('Votez pour le MVP · vs Carquefou')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Voter' })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-past?tab=vote',
      );
    });

    it.each([
      ['cannot vote (not convoked, not going, or a parent persona)', { canVote: false }],
      ['already voted', { hasVoted: true }],
    ])('owes no vote when the player %s', async (_label, vote) => {
      mockAgenda({ past: [playedMatch({ vote: { ...OPEN_VOTE, ...vote } })] });
      renderLoggedInAsPlayer();

      await screen.findByRole('heading', { name: 'Dernier match' });
      expect(screen.queryByText(/Votez pour le MVP/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Voter/ })).not.toBeInTheDocument();
    });

    it('gives a list card the travel line and a « Changer » link to the decision band', async () => {
      mockAgenda({
        upcoming: [
          agendaEvent({
            eventId: 'event-0',
            type: 'TRAINING',
            opponentName: null,
            myRsvpStatus: 'GOING',
          }),
          agendaEvent({
            eventId: 'event-2',
            startsAt: '2026-10-11T18:00:00.000Z',
            myRsvpStatus: 'GOING',
            myTravelMode: 'DIRECT',
            meetingPlan: MEETING_PLAN,
          }),
        ],
      });
      renderLoggedInAsPlayer();

      expect(await screen.findByText(/Direct à la salle · arrivée \d\d:\d\d/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Changer' })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-2?tab=decision',
      );
    });
  });

  describe('Dernier match', () => {
    it('shows the score, the player’s line and a link to the match stats', async () => {
      mockAgenda({ past: [playedMatch()] });
      renderLoggedInAsPlayer();

      const heading = await screen.findByRole('heading', { name: 'Dernier match' });
      const section = heading.closest('section')!;
      expect(within(section).getByText('62–58')).toBeInTheDocument();
      expect(within(section).getByText('Victoire')).toBeInTheDocument();
      expect(within(section).getByText('14 pts · 2 fautes')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Stats du match' })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-past?tab=scoresheet',
      );
    });

    it('says the stats are not in yet when the sheet is not confirmed', async () => {
      mockAgenda({ past: [playedMatch({ result: null, myMatchStats: null })] });
      renderLoggedInAsPlayer();

      expect(await screen.findByText('Stats pas encore saisies')).toBeInTheDocument();
    });

    it('hides the MVP while it is not public to the reader', async () => {
      mockAgenda({ past: [playedMatch()] });
      renderLoggedInAsPlayer();

      await screen.findByRole('heading', { name: 'Dernier match' });
      expect(screen.queryByText('MVP du match')).not.toBeInTheDocument();
    });

    it('shows the turnout once the reader voted and the window is open', async () => {
      mockAgenda({
        past: [
          playedMatch({
            vote: {
              ...OPEN_VOTE,
              hasVoted: true,
              mvp: [{ firstName: 'Karim', lastInitial: 'D', isMe: false }],
            },
          }),
        ],
      });
      renderLoggedInAsPlayer();

      expect(await screen.findByText('Votes en cours · 6 / 12')).toBeInTheDocument();
    });

    it('names the MVP « Vous ! » once public, and never the « joueur en difficulté »', async () => {
      mockAgenda({
        past: [
          playedMatch({
            startsAt: '2026-09-20T18:00:00.000Z',
            vote: {
              ...OPEN_VOTE,
              canVote: false,
              closesAt: '2026-09-25T18:00:00.000Z',
              mvp: [{ firstName: 'Chris', lastInitial: 'R', isMe: true }],
            },
          }),
        ],
      });
      mockSeason([seasonRow()]);
      renderLoggedInAsPlayer();

      expect(await screen.findByText('Vous !')).toBeInTheDocument();
      await screen.findByText('Meilleur total');
      expect(screen.queryByText(/difficulté/i)).not.toBeInTheDocument();
    });

    it('renders nothing when there is no recent match', async () => {
      renderLoggedInAsPlayer();

      await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
      expect(screen.queryByText('Dernier match')).not.toBeInTheDocument();
      expect(screen.queryByText('Derniers résultats')).not.toBeInTheDocument();
    });

    it('shows an error, not silence, when the past-matches query fails', async () => {
      server.use(
        http.get('/api/me/dashboard', ({ request }) =>
          requestSpanDays(new URL(request.url)) > 20
            ? HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 })
            : HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] }),
        ),
      );
      renderLoggedInAsPlayer();

      expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();
    });
  });

  describe('Derniers résultats', () => {
    it('lists the earlier matches after « Dernier match », at most three, with a link to all', async () => {
      mockAgenda({
        past: ['A', 'B', 'C', 'D', 'E'].map((name, index) =>
          playedMatch({
            eventId: `event-${name}`,
            opponentName: `Club ${name}`,
            startsAt: `2026-09-0${index + 1}T18:00:00.000Z`,
            vote: null,
          }),
        ),
      });
      renderLoggedInAsPlayer();

      await screen.findByText(/vs Club D/);
      const section = screen
        .getByRole('heading', { name: 'Derniers résultats' })
        .closest('section')!;
      // E is the newest (« Dernier match »); D, C, B follow; A is on /results.
      expect(within(section).getByText(/vs Club D/)).toBeInTheDocument();
      expect(within(section).getByText(/vs Club B/)).toBeInTheDocument();
      expect(within(section).queryByText(/vs Club E/)).not.toBeInTheDocument();
      expect(within(section).queryByText(/vs Club A/)).not.toBeInTheDocument();
      expect(within(section).getByRole('link', { name: /Tous les résultats/ })).toHaveAttribute(
        'href',
        '/results',
      );
    });
  });

  describe('Ma saison', () => {
    it('shows the player’s season from the team stats endpoint', async () => {
      mockSeason([seasonRow(), seasonRow({ teamPlayerId: 'tp-2', isMe: false, gamesPlayed: 9 })]);
      renderLoggedInAsPlayer();

      const heading = await screen.findByRole('heading', { name: 'Ma saison' });
      const section = heading.closest('section')!;
      await within(section).findByText('11,4');
      expect(within(section).getByText('5')).toBeInTheDocument();
      expect(within(section).getByText('19')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: /Toutes mes stats/ })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1?tab=stats',
      );
    });

    it('says nothing has been analysed yet at the start of a season', async () => {
      renderLoggedInAsPlayer();

      expect(
        await screen.findByText('Pas encore de match analysé cette saison.'),
      ).toBeInTheDocument();
    });

    it('shows an error for a team whose season fails to load', async () => {
      mockSeason('error');
      renderLoggedInAsPlayer();

      const heading = await screen.findByRole('heading', { name: 'Ma saison' });
      expect(
        await within(heading.closest('section')!).findByText('Chargement impossible'),
      ).toBeInTheDocument();
    });
  });

  it('lets a rostered player answer an agenda event without leaving the home screen', async () => {
    let requestBody: unknown;
    mockAgenda({ upcoming: [agendaEvent({ myConvocation: true })] });
    server.use(
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

  it('lists the later events under « Les 14 prochains jours », not the hero one', async () => {
    mockAgenda({
      upcoming: [
        agendaEvent({ myRsvpStatus: 'GOING' }),
        agendaEvent({
          eventId: 'event-2',
          opponentName: 'Orvault',
          myRsvpStatus: 'GOING',
          startsAt: '2026-10-12T18:00:00.000Z',
        }),
      ],
    });
    renderLoggedInAsPlayer();

    const heading = await screen.findByRole('heading', { name: 'Les 14 prochains jours' });
    const section = heading.closest('section')!;
    expect(within(section).getByText(/vs Orvault/)).toBeInTheDocument();
    expect(within(section).queryByText(/vs Les Aigles/)).not.toBeInTheDocument();
  });
});

describe('DashboardPage — acting for a child', () => {
  it('says whom the parent follows, not that they manage them, and shows the player view', async () => {
    window.localStorage.setItem('kluvo.actingAs.user-1', 'leo');
    server.use(
      http.get('/api/me/personas', () =>
        HttpResponse.json({
          self: { pendingCount: 0, playerIds: ['me'] },
          children: [
            {
              playerId: 'leo',
              firstName: 'Léo',
              lastName: 'Martin',
              clubId: 'club-1',
              clubName: 'COC Basket',
              teams: [{ teamId: 'team-2', teamName: 'U11' }],
              pendingCount: 0,
            },
          ],
        }),
      ),
    );
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          emailVerified: true,
          firstName: 'Chris',
          lastName: 'Rillesen',
          avatarUrl: null,
          // A club admin as themself: acting for the child still shows the
          // child's player view, never the manager's.
          memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
        }),
      ),
      http.get('/api/clubs', () => HttpResponse.json([{ id: 'club-1', name: 'COC Basket' }])),
    );
    renderWithProviders(
      <ActingAsProvider>
        <DashboardPage />
      </ActingAsProvider>,
    );

    expect(await screen.findByText('Vous suivez Léo Martin')).toBeInTheDocument();
    expect(screen.queryByText(/Vous gérez/)).not.toBeInTheDocument();
    expect(screen.queryByText('a@b.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Équipes gérées')).not.toBeInTheDocument();
    window.localStorage.clear();
  });
});
