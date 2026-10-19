import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import type { MatchStatLine } from '@basketeasy/types/team-stats';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchStatsTable } from './MatchStatsTable';

const URL = '/api/clubs/club-1/teams/team-1/stats/matches/event-1';

function line(overrides: Partial<MatchStatLine> = {}): MatchStatLine {
  return {
    teamPlayerId: 'tp-1',
    firstName: 'Léa',
    lastName: 'Moreau',
    jerseyNumber: 7,
    points: 14,
    fouls: 2,
    freeThrowPoints: 2,
    twoPointPoints: 6,
    threePointPoints: 6,
    isMe: false,
    ...overrides,
  };
}

function renderTable(hasStarted = true) {
  return renderWithProviders(
    <MatchStatsTable clubId="club-1" teamId="team-1" eventId="event-1" hasStarted={hasStarted} />,
  );
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

describe('MatchStatsTable', () => {
  afterEach(() => setWidth(1024));

  it('shows every line as a table row, the reader’s marked, with the repartition legend', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          hasStats: true,
          lines: [
            line(),
            line({ teamPlayerId: 'tp-2', firstName: 'Karim', lastName: 'Diallo', isMe: true }),
          ],
        }),
      ),
    );
    renderTable();

    const row = (await screen.findByText('Karim D.')).closest('tr')!;
    expect(within(row).getByText('Vous')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '3 PTS' })).toBeInTheDocument();
    expect(
      screen.getByText('Points marqués par type de panier, pas un pourcentage de réussite.'),
    ).toBeInTheDocument();
  });

  it('renders an unknown value as —, never 0', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          hasStats: true,
          lines: [line({ points: null, freeThrowPoints: null })],
        }),
      ),
    );
    renderTable();

    const row = (await screen.findByText('Léa M.')).closest('tr')!;
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps points and fouls only on a phone card', async () => {
    setWidth(390);
    server.use(http.get(URL, () => HttpResponse.json({ hasStats: true, lines: [line()] })));
    renderTable();

    expect(await screen.findByText('2 fautes')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/pourcentage de réussite/)).not.toBeInTheDocument();
  });

  it('renders nothing before a sheet is confirmed', async () => {
    let requested = false;
    server.use(
      http.get(URL, () => {
        requested = true;
        return HttpResponse.json({ hasStats: false, lines: [] });
      }),
    );
    const { container } = renderTable();

    await waitFor(() => expect(requested).toBe(true));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows an error with a retry when the lines fail to load', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ message: 'Erreur' }, { status: 500 })));
    renderTable();

    expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();
  });

  it('asks for nothing before kickoff', async () => {
    let requested = false;
    server.use(
      http.get(URL, () => {
        requested = true;
        return HttpResponse.json({ hasStats: true, lines: [line()] });
      }),
    );
    const { container } = renderTable(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requested).toBe(false);
    expect(container).toBeEmptyDOMElement();
  });

  describe('for a team manager', () => {
    const managedEvent = { id: 'event-1', opponentName: 'ES Rezé' } as TeamEvent;
    const renderManaged = () =>
      renderWithProviders(
        <MatchStatsTable
          clubId="club-1"
          teamId="team-1"
          eventId="event-1"
          hasStarted
          managedEvent={managedEvent}
        />,
      );

    it('offers « Modifier les stats » and flags a match corrected by hand', async () => {
      server.use(
        http.get(URL, () =>
          HttpResponse.json({
            hasStats: true,
            manuallyEdited: true,
            scoreboard: null,
            lines: [line()],
          }),
        ),
      );
      renderManaged();

      expect(await screen.findByRole('button', { name: 'Modifier les stats' })).toBeInTheDocument();
      expect(screen.getByText('Modifié')).toBeInTheDocument();
    });

    it('does not flag a match nobody touched', async () => {
      server.use(
        http.get(URL, () =>
          HttpResponse.json({
            hasStats: true,
            manuallyEdited: false,
            scoreboard: null,
            lines: [line()],
          }),
        ),
      );
      renderManaged();

      await screen.findByRole('button', { name: 'Modifier les stats' });
      expect(screen.queryByText('Modifié')).not.toBeInTheDocument();
    });

    it('keeps the section for a confirmed score with no player line, so it can be completed', async () => {
      server.use(
        http.get(URL, () =>
          HttpResponse.json({
            hasStats: false,
            manuallyEdited: false,
            scoreboard: { ourScore: 62, theirScore: 55, periods: [] },
            lines: [],
          }),
        ),
      );
      renderManaged();

      expect(await screen.findByText('Aucune ligne joueur pour ce match.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Modifier les stats' })).toBeInTheDocument();
    });

    it('stays out of the way of a match with nothing yet (the sheet flow carries that)', async () => {
      server.use(
        http.get(URL, () =>
          HttpResponse.json({
            hasStats: false,
            manuallyEdited: false,
            scoreboard: null,
            lines: [],
          }),
        ),
      );
      renderManaged();

      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Modifier les stats' })).not.toBeInTheDocument();
    });
  });

  it('never shows « Modifier les stats » to a reader who does not manage the team', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          hasStats: true,
          manuallyEdited: true,
          scoreboard: null,
          lines: [line()],
        }),
      ),
    );
    renderTable();

    await screen.findByText('Léa M.');
    expect(screen.queryByRole('button', { name: 'Modifier les stats' })).not.toBeInTheDocument();
    expect(screen.getByText('Modifié')).toBeInTheDocument();
  });
});
