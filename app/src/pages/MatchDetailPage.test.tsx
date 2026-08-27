import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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
});
