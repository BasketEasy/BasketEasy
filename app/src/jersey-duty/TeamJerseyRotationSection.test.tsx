import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { JerseyRotationOverview, JerseyRotationRow } from '@basketeasy/types/jersey-duty';
import { DESKTOP_BREAKPOINT_PX } from '@basketeasy/ui/use-is-desktop-viewport';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamJerseyRotationSection } from './TeamJerseyRotationSection';

const ROTATION_URL = '/api/clubs/club-1/teams/team-1/jersey-rotation';

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}
const ORIGINAL_WIDTH = window.innerWidth;
afterEach(() => setViewport(ORIGINAL_WIDTH));

function row(overrides: Partial<JerseyRotationRow> & { teamPlayerId: string }): JerseyRotationRow {
  return {
    firstName: 'Inès',
    lastName: 'Bernard',
    turnsThisSeason: 0,
    lastTurnAt: null,
    playerId: `p-${overrides.teamPlayerId}`,
    exempt: false,
    isMe: false,
    ...overrides,
  };
}

const rows = [
  row({ teamPlayerId: 'tp-ines' }),
  row({ teamPlayerId: 'tp-lea', firstName: 'Léa', lastName: 'Garnier', isMe: true }),
  row({
    teamPlayerId: 'tp-emma',
    firstName: 'Emma',
    lastName: 'Martin',
    turnsThisSeason: 1,
    lastTurnAt: '2026-09-27T12:00:00.000Z',
  }),
  row({ teamPlayerId: 'tp-sarah', firstName: 'Sarah', lastName: 'Kone', exempt: true }),
];

function overview(overrides: Partial<JerseyRotationOverview> = {}): JerseyRotationOverview {
  return {
    seasonYear: 2026,
    teamGender: 'WOMEN',
    enabled: true,
    canManage: false,
    nextMatch: {
      eventId: 'event-9',
      startsAt: '2026-10-04T12:00:00.000Z',
      holder: null,
      suggestion: { teamPlayerId: 'tp-emma', firstName: 'Emma', lastName: 'Martin' },
    },
    rows,
    ...overrides,
  };
}

function mockOverview(data: JerseyRotationOverview) {
  server.use(http.get(ROTATION_URL, () => HttpResponse.json(data)));
}

function renderSection() {
  return renderWithProviders(<TeamJerseyRotationSection clubId="club-1" teamId="team-1" />);
}

describe('TeamJerseyRotationSection', () => {
  it('shows the player view: season, next match, rows, count, exempt badge and footnote', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    mockOverview(overview());
    renderSection();

    expect(await screen.findByRole('heading', { name: 'Lavage des maillots' })).toBeInTheDocument();
    expect(screen.getByText('Saison 2026-2027')).toBeInTheDocument();
    expect(screen.getByText(/Prochain match ·/)).toBeInTheDocument();
    const suggestion = screen.getByRole('link', { name: 'Suggestion : Emma M.' });
    expect(suggestion).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-9');
    expect(screen.getByText('Joueuse')).toBeInTheDocument();
    expect(screen.getByText('Lavages')).toBeInTheDocument();
    expect(screen.getByText('Léa G. (vous)')).toBeInTheDocument();
    expect(screen.getByText('Dernier : 27 sept.')).toBeInTheDocument();
    expect(screen.getAllByText('Dernier : —')).toHaveLength(3);
    expect(screen.getByText('Exemptée')).toBeInTheDocument();
    expect(
      screen.getByText('Ordre de suggestion : le moins de lavages, puis le plus ancien.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('says « Lavage » when the next match already has a holder, and « Aucune suggestion » when nobody is in the pool', async () => {
    mockOverview(
      overview({
        nextMatch: {
          eventId: 'event-9',
          startsAt: '2026-10-04T12:00:00.000Z',
          holder: { teamPlayerId: 'tp-emma', firstName: 'Emma', lastName: 'Martin' },
          suggestion: null,
        },
      }),
    );
    const first = renderSection();
    expect(await screen.findByText('Lavage : Emma M.')).toBeInTheDocument();
    first.unmount();

    mockOverview(
      overview({
        nextMatch: {
          eventId: 'event-9',
          startsAt: '2026-10-04T12:00:00.000Z',
          holder: null,
          suggestion: null,
        },
      }),
    );
    renderSection();
    expect(await screen.findByText('Aucune suggestion pour l’instant')).toBeInTheDocument();
  });

  it('renders no next-match tile without an upcoming match', async () => {
    mockOverview(overview({ nextMatch: null }));
    renderSection();
    await screen.findByText('Léa G. (vous)');
    expect(screen.queryByText(/Prochain match/)).not.toBeInTheDocument();
  });

  it('shows the manager view: counts, switches and the rotation switch, without header or footnote', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    mockOverview(overview({ canManage: true }));
    renderSection();

    expect(await screen.findByText('1 lavage · 27 sept.')).toBeInTheDocument();
    expect(screen.getAllByText('0 lavage · —')).toHaveLength(3);
    expect(screen.getByRole('switch', { name: 'Exempter Emma M.' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: 'Exempter Sarah K.' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Rotation activée' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Désactivez si le club lave les maillots.')).toBeInTheDocument();
    expect(screen.queryByText('Joueuse')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ordre de suggestion/)).not.toBeInTheDocument();
    expect(screen.queryByText('(vous)', { exact: false })).not.toBeInTheDocument();
  });

  it('renders a real table with the three columns on desktop', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX);
    mockOverview(overview());
    renderSection();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Joueuse' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Lavages' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Dernier lavage' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Exemptée' })).not.toBeInTheDocument();
  });

  it('adds an « Exemptée » column with switches for a manager on desktop', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX);
    mockOverview(overview({ canManage: true }));
    renderSection();
    expect(await screen.findByRole('columnheader', { name: 'Exemptée' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Exempter Emma M.' })).toBeInTheDocument();
  });

  it('shows an error with a retry, never an empty state', async () => {
    server.use(http.get(ROTATION_URL, () => new HttpResponse(null, { status: 500 })));
    renderSection();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aucune joueuse dans l’effectif.')).not.toBeInTheDocument();
  });

  it('shows a loading state before the answer', () => {
    server.use(http.get(ROTATION_URL, () => new Promise(() => {})));
    renderSection();
    expect(screen.queryByRole('heading', { name: 'Lavage des maillots' })).not.toBeInTheDocument();
  });

  it('shows an empty state for a roster with nobody on it, in the team’s gender', async () => {
    mockOverview(overview({ rows: [], nextMatch: null }));
    renderSection();
    expect(await screen.findByText('Aucune joueuse dans l’effectif.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('exempts a player with their playerId, then confirms with a toast', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    mockOverview(overview({ canManage: true }));
    let body: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/players/p-tp-emma', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      }),
    );
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'Exempter Emma M.' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(body).toEqual({ jerseyDutyExempt: true }));
  });

  it('puts the switch back when the write is refused', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    mockOverview(overview({ canManage: true }));
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/players/p-tp-emma',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'Exempter Emma M.' });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('turns the rotation off through the team route', async () => {
    setViewport(DESKTOP_BREAKPOINT_PX - 1);
    mockOverview(overview({ canManage: true }));
    let body: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'team-1', jerseyRotationEnabled: false });
      }),
    );
    renderSection();
    await userEvent.click(await screen.findByRole('switch', { name: 'Rotation activée' }));
    await waitFor(() => expect(body).toEqual({ jerseyRotationEnabled: false }));
  });

  it('keeps only the switch for a manager when the rotation is off, and nothing for a player', async () => {
    mockOverview(overview({ enabled: false, canManage: true, rows: [], nextMatch: null }));
    const manager = renderSection();
    const card = (await screen.findByRole('switch', { name: 'Rotation activée' })).closest('div');
    expect(card).not.toBeNull();
    expect(
      within(card!.parentElement!).getByText('Désactivez si le club lave les maillots.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucune joueuse dans l’effectif.')).not.toBeInTheDocument();
    manager.unmount();

    mockOverview(overview({ enabled: false, canManage: false, rows: [], nextMatch: null }));
    renderSection();
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Lavage des maillots' }),
      ).not.toBeInTheDocument(),
    );
  });
});
