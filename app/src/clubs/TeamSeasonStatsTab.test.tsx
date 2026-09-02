import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { TeamSeasonPlayerStats, TeamSeasonStats } from '@basketeasy/types/team-stats';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamSeasonStatsTab } from './TeamSeasonStatsTab';

const player = (overrides: Partial<TeamSeasonPlayerStats> = {}): TeamSeasonPlayerStats => ({
  teamPlayerId: 'tp-1',
  firstName: 'Camille',
  lastName: 'Roy',
  role: 'PLAYER',
  gamesPlayed: 8,
  pointsPerGame: 14.6,
  foulsPerGame: 2.1,
  seasonHighPoints: 24,
  seasonHighFouls: 4,
  freeThrowPoints: 18,
  twoPointPoints: 72,
  threePointPoints: 27,
  totalPoints: 117,
  mvpAwards: 3,
  worstPlayerAwards: 0,
  ...overrides,
});

const stats = (overrides: Partial<TeamSeasonStats> = {}): TeamSeasonStats => ({
  seasonYear: 2026,
  seasonStart: '2026-09-01T00:00:00.000Z',
  seasonEnd: '2027-08-31T23:59:59.999Z',
  matchesPlayed: 8,
  availableSeasons: [2026, 2025],
  players: [player()],
  ...overrides,
});

function mockStats(body: TeamSeasonStats) {
  server.use(http.get('/api/clubs/club-1/teams/team-1/stats', () => HttpResponse.json(body)));
}

function renderTab(props: { season?: number; onSeasonChange?: (season: number) => void } = {}) {
  return renderWithProviders(
    <TeamSeasonStatsTab
      clubId="club-1"
      teamId="team-1"
      season={props.season}
      onSeasonChange={props.onSeasonChange ?? (() => {})}
    />,
  );
}

describe('TeamSeasonStatsTab', () => {
  it('shows a retry affordance when the season fails to load, never an empty state', async () => {
    server.use(
      http.get(
        '/api/clubs/club-1/teams/team-1/stats',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderTab();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    // Telling a coach "aucun match analysé" when the request merely failed
    // would claim their season doesn't exist.
    expect(screen.queryByText('Aucun match analysé cette saison')).not.toBeInTheDocument();
  });

  it('offers a route to the events tab when no match has been analysed', async () => {
    mockStats(stats({ matchesPlayed: 0, players: [], availableSeasons: [2026] }));

    renderTab();

    expect(await screen.findByText('Aucun match analysé cette saison')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir les événements/ })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1?tab=events',
    );
    // One meaningless option is not a choice — the selector stays away.
    expect(screen.queryByLabelText('Saison')).not.toBeInTheDocument();
  });

  it('renders a season and states what it was calculated from', async () => {
    mockStats(stats());

    renderTab();

    expect(await screen.findByText('Camille Roy')).toBeInTheDocument();
    expect(screen.getByText('Calculé sur 8 matchs analysés.')).toBeInTheDocument();
    expect(screen.getByText('14,6')).toBeInTheDocument();
    expect(screen.getByText('MVP ×3')).toBeInTheDocument();
  });

  it('says the repartition is not a shooting percentage', async () => {
    mockStats(stats());

    renderTab();

    expect(await screen.findByText(/pas une adresse/)).toBeInTheDocument();
    expect(screen.getByText('comment les points ont été marqués')).toBeInTheDocument();
  });

  it('shows an em dash, not a zero, for an average nothing measured', async () => {
    mockStats(
      stats({
        players: [
          player({
            firstName: 'Nina',
            lastName: 'Perrin',
            gamesPlayed: 2,
            pointsPerGame: null,
            seasonHighPoints: null,
            totalPoints: 0,
            freeThrowPoints: 0,
            twoPointPoints: 0,
            threePointPoints: 0,
            mvpAwards: 0,
          }),
        ],
      }),
    );

    renderTab();

    const row = (await screen.findByText('Nina Perrin')).closest('tr') as HTMLElement;
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
    // She played; the running-score column just wasn't legible.
    expect(within(row).getByText('Marque non lue')).toBeInTheDocument();
  });

  it('distinguishes a player who has never played from one whose score was unreadable', async () => {
    mockStats(
      stats({
        players: [
          player({
            firstName: 'Alice',
            lastName: 'Lemoine',
            gamesPlayed: 0,
            pointsPerGame: null,
            foulsPerGame: null,
            seasonHighPoints: null,
            seasonHighFouls: null,
            totalPoints: 0,
            freeThrowPoints: 0,
            twoPointPoints: 0,
            threePointPoints: 0,
            mvpAwards: 0,
          }),
        ],
      }),
    );

    renderTab();

    const row = (await screen.findByText('Alice Lemoine')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Aucun match')).toBeInTheDocument();
  });

  it('renders each record as a card below the desktop breakpoint', async () => {
    // One component, two layouts — the formatting rules (em dash for an
    // unknown average, why a bar is empty) must hold in both.
    const desktopWidth = window.innerWidth;
    window.innerWidth = 390;
    try {
      mockStats(
        stats({
          players: [player({ mvpAwards: 0, worstPlayerAwards: 2, pointsPerGame: null })],
        }),
      );

      renderTab();

      expect(await screen.findByText('Camille Roy')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('En difficulté ×2')).toBeInTheDocument();
      // The card carries its own legend, since it is read on its own.
      expect(screen.getByText('LF')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    } finally {
      window.innerWidth = desktopWidth;
    }
  });

  it('reports a season change to its owner', async () => {
    mockStats(stats());
    const onSeasonChange = vi.fn();
    const user = userEvent.setup();

    renderTab({ onSeasonChange });

    await screen.findByText('Camille Roy');
    await user.click(screen.getByRole('combobox', { name: 'Saison' }));
    await user.click(await screen.findByRole('option', { name: 'Saison 2025-2026' }));

    expect(onSeasonChange).toHaveBeenCalledWith(2025);
  });
});
