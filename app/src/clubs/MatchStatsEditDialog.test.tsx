import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import type { MatchStats } from '@basketeasy/types/team-stats';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchStatsEditDialog } from './MatchStatsEditDialog';

const STATS_URL = '/api/clubs/club-1/teams/team-1/stats/matches/event-1';

const event = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  opponentName: 'ES Rezé',
  venue: 'HOME',
} as TeamEvent;

const line = (teamPlayerId: string, firstName: string, overrides = {}) => ({
  teamPlayerId,
  firstName,
  lastName: 'Martin',
  jerseyNumber: 7,
  points: 12,
  fouls: 2,
  freeThrowPoints: 2,
  twoPointPoints: 10,
  threePointPoints: 0,
  isMe: false,
  ...overrides,
});

const stored: MatchStats = {
  hasStats: true,
  manuallyEdited: false,
  scoreboard: { ourScore: 62, theirScore: 55, periods: [{ ours: 16, theirs: 12 }] },
  lines: [
    line('tp-1', 'Léa'),
    line('tp-2', 'Sarah', { jerseyNumber: 9, points: 8, twoPointPoints: 8, freeThrowPoints: 0 }),
  ],
};

const rosterMember = (id: string, firstName: string) => ({
  id,
  teamId: 'team-1',
  playerId: `p-${id}`,
  firstName,
  lastName: 'Martin',
  clubId: 'club-1',
  role: 'PLAYER' as const,
  jerseyDutyExempt: false,
  createdAt: 'x',
});

function mockStats(stats: MatchStats) {
  server.use(
    http.get(STATS_URL, () => HttpResponse.json(stats)),
    http.get('/api/clubs/club-1/teams/team-1/players', () =>
      HttpResponse.json({
        items: [
          rosterMember('tp-1', 'Léa'),
          rosterMember('tp-2', 'Sarah'),
          rosterMember('tp-3', 'Manon'),
        ],
        total: 3,
        page: 1,
        pageSize: 100,
      }),
    ),
  );
}

function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
  return renderWithProviders(
    <MatchStatsEditDialog
      clubId="club-1"
      teamId="team-1"
      event={event}
      open
      onOpenChange={onOpenChange}
    />,
  );
}

describe('MatchStatsEditDialog', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  it('starts from the stored match: score, periods and every player line', async () => {
    mockStats(stored);
    renderDialog();

    expect(await screen.findByLabelText('Score final Nous')).toHaveValue('62');
    expect(screen.getByRole('heading', { name: 'Modifier les stats' })).toBeInTheDocument();
    expect(screen.getByLabelText('Score final ES Rezé')).toHaveValue('55');
    expect(screen.getByLabelText('QT 1 Nous')).toHaveValue('16');
    expect(screen.getByLabelText('PTS Léa M.', { exact: true })).toHaveValue('12');
    expect(screen.getByLabelText('N° Sarah M.')).toHaveValue('9');
  });

  it('opens as an empty entry for a match with no score and no line', async () => {
    mockStats({ hasStats: false, manuallyEdited: false, scoreboard: null, lines: [] });
    renderDialog();

    expect(await screen.findByLabelText('Score final Nous')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Saisir les stats' })).toBeInTheDocument();
    expect(screen.getByLabelText('QT 4 Nous')).toBeInTheDocument();
  });

  it('shows a contradicting split on its line and refuses to save', async () => {
    mockStats(stored);
    let saved = false;
    server.use(
      http.put(STATS_URL, () => {
        saved = true;
        return HttpResponse.json(stored);
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    const lf = await screen.findByLabelText('LF Léa M.');
    await user.clear(lf);
    await user.type(lf, '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Léa M. : 3 PTS + 2 PTS + LF = 13, mais PTS = 12.'),
    ).toBeInTheDocument();
    expect(saved).toBe(false);
  });

  it('notes the gap with the score without blocking the save', async () => {
    mockStats(stored);
    let body: unknown;
    server.use(
      http.put(STATS_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(stored);
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    // 12 + 8 = 20 against 62.
    expect(await screen.findByText('Écart avec le score')).toBeInTheDocument();
    expect(
      screen.getByText(/Total des joueurs : 20 pts\. Score du match : 62\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toMatchObject({ ourScore: 62, theirScore: 55 }));
  });

  it('sends the edited match and closes', async () => {
    mockStats(stored);
    let body: { lines: { teamPlayerId: string }[] } | undefined;
    server.use(
      http.put(STATS_URL, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(stored);
      }),
    );
    const closed: boolean[] = [];
    const user = userEvent.setup();
    renderDialog((open) => closed.push(open));

    const score = await screen.findByLabelText('Score final Nous');
    await user.clear(score);
    await user.type(score, '70');
    await user.click(screen.getByRole('button', { name: 'Retirer Sarah M. du match' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(closed).toContain(false));
    expect(body).toMatchObject({ ourScore: 70, periods: [{ ours: 16, theirs: 12 }] });
    expect(body?.lines.map((l) => l.teamPlayerId)).toEqual(['tp-1']);
  });

  it('adds a roster member who is not on the match yet', async () => {
    mockStats(stored);
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Ajouter un joueur' }));
    const options = await screen.findAllByRole('option');
    // Léa and Sarah are already listed.
    expect(options.map((option) => option.textContent)).toEqual(['Manon Martin']);
    await user.click(options[0]);

    expect(await screen.findByLabelText('PTS Manon M.', { exact: true })).toHaveValue('');
  });

  it('keeps the dialog open and says what the server refused', async () => {
    mockStats(stored);
    server.use(
      http.put(STATS_URL, () =>
        HttpResponse.json(
          { statusCode: 409, message: "La feuille de ce match n'est pas encore confirmée" },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText("La feuille de ce match n'est pas encore confirmée"),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lays the same fields out as cards on a phone, the split behind « Détail par panier »', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mockStats(stored);
    const user = userEvent.setup();
    renderDialog();

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByLabelText('Nous')).toHaveValue('62');
    expect(within(dialog).queryByLabelText('LF Léa M.')).not.toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Détail par panier' })[0]);
    expect(within(dialog).getByLabelText('LF Léa M.')).toHaveValue('2');
  });
});
