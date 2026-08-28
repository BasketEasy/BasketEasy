import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry, EventRsvpRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

const baseTeam = {
  id: 'team-1',
  name: 'U15 Filles',
  category: 'U15',
  gender: 'WOMEN',
  createdAt: 'x',
};

const matchEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: '2026-08-30T18:00:00.000Z',
  location: 'Gymnase Pierre de Coubertin',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
  logistics: { jerseys: null, balls: null },
};

const rsvpRoster: EventRsvpRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    status: 'GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    isMe: false,
  },
];

const convocationRoster: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: false,
  },
];

const route = '/clubs/club-1/teams/team-1/events/event-1';

const trainingEvent = {
  ...matchEvent,
  id: 'event-2',
  type: 'TRAINING',
  opponentName: null,
  venue: null,
};

const trainingRoute = '/clubs/club-1/teams/team-1/events/event-2';

describe('EventDetailPage', () => {
  it('renders the header, hero, and info grid for a MATCH event', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
    );

    renderWithProviders(<App />, { route });

    expect(
      await screen.findByRole('heading', { name: /u15 filles vs es rezé/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Domicile')).toBeInTheDocument();
    expect(screen.getAllByText('Gymnase Pierre de Coubertin').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Aperçu' })).toBeInTheDocument();
  });

  it('shows an error state with retry when the event fails to load', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('renders the header and hero for a TRAINING event, with no opponent/venue chrome', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-2', () =>
        HttpResponse.json(trainingEvent),
      ),
    );

    renderWithProviders(<App />, { route: trainingRoute });

    expect(
      await screen.findByRole('heading', { name: /u15 filles — entraînement/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();
    expect(screen.queryByText(/vs/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Adversaire')).not.toBeInTheDocument();
    expect(screen.getAllByText('Gymnase Pierre de Coubertin').length).toBeGreaterThan(0);
  });

  it('shows Modifier/Supprimer for a manager, for both event types', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-2', () =>
        HttpResponse.json(trainingEvent),
      ),
    );

    renderWithProviders(<App />, { route: trainingRoute });

    await screen.findByRole('heading', { name: /entraînement/i });
    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^supprimer$/i })).toBeInTheDocument();
  });

  it('switches to the Effectif tab and shows the merged roster, with manage access for a club admin', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () =>
        HttpResponse.json(rsvpRoster),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(convocationRoster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { name: /u15 filles vs es rezé/i });
    await user.click(screen.getByRole('tab', { name: 'Effectif' }));

    expect(await screen.findByText('Lea Bernard')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /gérer la convocation/i }),
    ).toBeInTheDocument();
  });

  it('shows a Vote tab for a convoked and present MATCH viewer, but not for a TRAINING event', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const eligibleMatchEvent = { ...matchEvent, myConvocation: true, myRsvpStatus: 'GOING' };
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(eligibleMatchEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-2', () =>
        HttpResponse.json(trainingEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
    );

    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { name: /u15 filles vs es rezé/i });
    expect(screen.getByRole('tab', { name: 'Vote' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Vote' }));
    expect(await screen.findByText('Le vote ouvrira après le match')).toBeInTheDocument();
    unmount();

    renderWithProviders(<App />, { route: trainingRoute });
    await screen.findByRole('heading', { name: /entraînement/i });
    expect(screen.queryByRole('tab', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('hides the Vote tab for a MATCH viewer not both convoked and present, while voting is still open', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    // Base matchEvent fixture: myConvocation false, myRsvpStatus null — not
    // eligible, and startsAt is in the future so the window hasn't closed.
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
      ),
    );

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { name: /u15 filles vs es rezé/i });
    expect(screen.queryByRole('tab', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('shows the Vote tab once the vote window has closed, even for a viewer who was never convoked', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const closedMatchEvent = {
      ...matchEvent,
      startsAt: '2020-01-05T18:00:00.000Z',
      myConvocation: false,
      myRsvpStatus: null,
    };
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(closedMatchEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json({
          best: [],
          worst: [],
          totalVoters: 0,
          votesCast: 0,
          myVote: { best: null, worst: null },
        }),
      ),
    );

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { name: /u15 filles vs es rezé/i });
    expect(screen.getByRole('tab', { name: 'Vote' })).toBeInTheDocument();
  });

  it('shows the Feuille de match tab only for a MATCH event, and renders its content on click', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-2', () =>
        HttpResponse.json(trainingEvent),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json(null),
      ),
    );
    const user = userEvent.setup();

    const { unmount } = renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { name: /u15 filles vs es rezé/i });
    expect(screen.getByRole('tab', { name: 'Feuille de match' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Feuille de match' }));
    expect(await screen.findByText('Aucune feuille de match pour le moment')).toBeInTheDocument();
    unmount();

    renderWithProviders(<App />, { route: trainingRoute });
    await screen.findByRole('heading', { name: /entraînement/i });
    expect(screen.queryByRole('tab', { name: 'Feuille de match' })).not.toBeInTheDocument();
  });
});
