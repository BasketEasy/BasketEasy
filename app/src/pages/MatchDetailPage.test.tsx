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

describe('MatchDetailPage', () => {
  it('renders the header, hero, and info grid for a MATCH event', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
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

  it('redirects away from a TRAINING event id', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json({ ...matchEvent, type: 'TRAINING', opponentName: null, venue: null }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
    );

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('heading', { name: /u15 filles/i })).toBeInTheDocument();
    expect(screen.queryByText(/es rezé/i)).not.toBeInTheDocument();
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
});
