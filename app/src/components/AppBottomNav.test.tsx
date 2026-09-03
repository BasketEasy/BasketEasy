import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AppBottomNav } from './AppBottomNav';

// The bar is mobile-only, and useIsDesktopViewport() reads innerWidth at
// mount — jsdom's default (1024) is above the breakpoint, so every test that
// wants a bar has to say so first.
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] = []) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'lea@example.fr', memberships }),
    ),
  );
}

interface TeamOverrides {
  teamId?: string;
  teamName?: string;
  clubId?: string;
  isTeamAdmin?: boolean;
  rosterRole?: 'PLAYER' | 'COACH' | null;
}

function team(overrides: TeamOverrides = {}) {
  return {
    teamId: 'team-1',
    teamName: 'Seniors Filles 1',
    category: 'SENIOR',
    gender: 'WOMEN',
    clubId: 'club-1',
    clubName: 'COC Basket',
    isTeamAdmin: false,
    rosterRole: 'PLAYER',
    ...overrides,
  };
}

function mockTeams(teams: ReturnType<typeof team>[]) {
  server.use(http.get('/api/me/teams', () => HttpResponse.json(teams)));
}

function mockAdminClubs(clubs: { id: string; name: string }[]) {
  server.use(
    http.get('/api/clubs', () =>
      HttpResponse.json(clubs.map((club) => ({ ...club, createdAt: '2026-01-01' }))),
    ),
  );
}

function mockAgenda(events: { eventId: string; teamId: string; myRsvpStatus: string | null }[]) {
  server.use(
    http.get('/api/me/dashboard', () =>
      HttpResponse.json({
        totalPlayers: 0,
        upcomingEvents: events.map((event) => ({
          teamName: 'Seniors Filles 1',
          clubId: 'club-1',
          clubName: 'COC Basket',
          type: 'MATCH',
          startsAt: '2026-09-05T18:00:00.000Z',
          location: 'Gymnase du Vigneau',
          notes: null,
          opponentName: 'ESB Rezé',
          myConvocation: true,
          ...event,
        })),
      }),
    ),
  );
}

describe('AppBottomNav', () => {
  afterEach(() => setViewportWidth(1024));

  it("gives a player with one team a direct link to it, and no destination that doesn't apply to them", async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team()]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    const bar = await screen.findByRole('navigation', { name: 'Navigation principale' });
    expect(bar).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Ma semaine' })).toHaveAttribute('href', '/dashboard');
    // Straight to the team, not through /my-teams — which for one team is a
    // whole page rendering a single row with a "Voir" button.
    expect(screen.getByRole('link', { name: 'Mon équipe' })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1',
    );
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('link', { name: 'Club' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Accueil' })).not.toBeInTheDocument();
  });

  it('sends a player with several teams to the list instead, relabelled', async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team(), team({ teamId: 'team-2', teamName: 'U18 Filles' })]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    expect(await screen.findByRole('link', { name: 'Mes équipes' })).toHaveAttribute(
      'href',
      '/my-teams',
    );
    expect(screen.queryByRole('link', { name: 'Mon équipe' })).not.toBeInTheDocument();
  });

  it('sends a player with no club-admin destination to /results in the third slot', async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team()]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    expect(await screen.findByRole('link', { name: 'Résultats' })).toHaveAttribute(
      'href',
      '/results',
    );
  });

  it('also sends a TeamAdmin-only manager (no club-ADMIN membership) to /results — they have no club roster to reach either', async () => {
    setViewportWidth(390);
    mockSession([]);
    mockTeams([team({ isTeamAdmin: true, rosterRole: null })]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    expect(await screen.findByRole('link', { name: 'Résultats' })).toHaveAttribute(
      'href',
      '/results',
    );
  });

  it('swaps the third item for the active club and relabels the first two for a club admin', async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockAdminClubs([{ id: 'club-1', name: 'COC Basket' }]);
    mockTeams([team({ isTeamAdmin: true, rosterRole: null })]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    expect(await screen.findByRole('link', { name: 'Accueil' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Équipes' })).toHaveAttribute('href', '/my-teams');
    expect(screen.getByRole('link', { name: 'Club' })).toHaveAttribute(
      'href',
      '/clubs/club-1/members',
    );
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('link', { name: /Résultats/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ma semaine' })).not.toBeInTheDocument();
  });

  it("counts the answers a player still owes into the first item's accessible name", async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team()]);
    mockAgenda([
      { eventId: 'event-1', teamId: 'team-1', myRsvpStatus: null },
      { eventId: 'event-2', teamId: 'team-1', myRsvpStatus: 'GOING' },
      { eventId: 'event-3', teamId: 'team-1', myRsvpStatus: null },
      // Not on a team this viewer is rostered on: not an answer they owe.
      { eventId: 'event-4', teamId: 'team-9', myRsvpStatus: null },
    ]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    expect(await screen.findByRole('link', { name: 'Ma semaine (2)' })).toBeInTheDocument();
    // The pip itself is decorative — the number reaches a screen reader
    // through the name above, not through the graphic.
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the item for the page being read, including a page nested under it', async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team()]);

    renderWithProviders(<AppBottomNav />, {
      route: '/clubs/club-1/teams/team-1/events/event-1',
    });

    expect(await screen.findByRole('link', { name: 'Mon équipe' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Ma semaine' })).not.toHaveAttribute('aria-current');
  });

  it('renders nothing above the desktop breakpoint, where the header carries the links', async () => {
    setViewportWidth(1280);
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockTeams([team()]);

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Navigation principale' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('waits for the role to resolve rather than mounting the player layout and relabelling it a beat later', async () => {
    setViewportWidth(390);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockAdminClubs([{ id: 'club-1', name: 'COC Basket' }]);
    // Never answers: the role is unknown for the whole of this test.
    server.use(http.get('/api/me/teams', () => new Promise(() => {})));

    renderWithProviders(<AppBottomNav />, { route: '/dashboard' });

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Profil' })).toBeNull());
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
