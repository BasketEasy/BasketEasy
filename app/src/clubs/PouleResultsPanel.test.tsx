import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { PouleResults } from '@basketeasy/types/ffbb';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { PouleResultsPanel } from './PouleResultsPanel';

const ROUTE = '/api/clubs/club-1/teams/team-1/ffbb-poule-results';

function mockResults(body: PouleResults) {
  server.use(http.get(ROUTE, () => HttpResponse.json(body)));
}

function results(overrides: Partial<PouleResults> = {}): PouleResults {
  return {
    competitionLabel: 'Seniors M D3, Poule A',
    standings: [
      { teamLabel: 'Vertou Basket Club', played: 3, won: 3, lost: 0, points: 6, isOurTeam: false },
      {
        teamLabel: 'Basket Club Basse Goulaine',
        played: 3,
        won: 2,
        lost: 1,
        points: 5,
        isOurTeam: true,
      },
    ],
    matchdays: [
      {
        matchdayLabel: 'Journée 3',
        results: [
          {
            homeLabel: 'Basket Club Basse Goulaine',
            awayLabel: 'Nantes Sully Basket',
            homeScore: 68,
            awayScore: 61,
            involvesOurTeam: true,
          },
        ],
      },
      {
        matchdayLabel: 'Journée 2',
        results: [
          {
            homeLabel: 'AS Rezé Basket',
            awayLabel: 'Basket Club Basse Goulaine',
            homeScore: 55,
            awayScore: 50,
            involvesOurTeam: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPanel() {
  return renderWithProviders(<PouleResultsPanel clubId="club-1" teamId="team-1" />);
}

describe('PouleResultsPanel', () => {
  it('shows a retry affordance when the fetch fails, never the no-link empty state', async () => {
    server.use(
      http.get(
        ROUTE,
        () =>
          new HttpResponse(
            JSON.stringify({
              message: 'Impossible de récupérer les résultats de la poule pour le moment.',
              code: 'FFBB_POULE_UNAVAILABLE',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Aucune compétition FFBB liée')).not.toBeInTheDocument();
  });

  it('shows the no-link empty state on a plain 404 with no error code', async () => {
    server.use(
      http.get(
        ROUTE,
        () =>
          new HttpResponse(JSON.stringify({ message: 'No FFBB link on this team' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    renderPanel();

    expect(await screen.findByText('Aucune compétition FFBB liée')).toBeInTheDocument();
  });

  it('renders standings and latest results, highlighting our own team/matches', async () => {
    mockResults(results());

    renderPanel();

    expect((await screen.findAllByText('Basket Club Basse Goulaine')).length).toBe(3);
    expect(screen.getByText('Vertou Basket Club')).toBeInTheDocument();
    expect(screen.getByText('Nantes Sully Basket')).toBeInTheDocument();
    expect(screen.getAllByText('nous').length).toBeGreaterThan(0);
    expect(screen.getByText('Journée 3')).toBeInTheDocument();
    expect(screen.getByText('Journée 2')).toBeInTheDocument();
  });

  it('renders its own empty copy for standings/results without falling back to the no-link empty state', async () => {
    mockResults(results({ standings: [], matchdays: [] }));

    renderPanel();

    expect(
      await screen.findByText("Le classement n'est pas encore disponible."),
    ).toBeInTheDocument();
    expect(screen.getByText('Aucun résultat pour le moment.')).toBeInTheDocument();
    expect(screen.queryByText('Aucune compétition FFBB liée')).not.toBeInTheDocument();
  });
});
