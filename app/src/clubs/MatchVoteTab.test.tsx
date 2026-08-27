import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type {
  EventConvocationRosterEntry,
  EventVoteResults,
  TeamEvent,
} from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchVoteTab } from './MatchVoteTab';

const DAY_MS = 24 * 60 * 60 * 1000;

// Within the vote window (opens startsAt+1h, closes startsAt+5d) and the
// caller marked present — the baseline fixture most tests build on.
const openMatchEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
  location: 'Gymnase Pierre de Coubertin',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: 'GOING',
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
  logistics: { jerseys: null, balls: null },
};

const futureMatchEvent: TeamEvent = {
  ...openMatchEvent,
  startsAt: new Date(Date.now() + DAY_MS).toISOString(),
};

const closedMatchEvent: TeamEvent = {
  ...openMatchEvent,
  startsAt: new Date(Date.now() - 6 * DAY_MS).toISOString(),
};

const roster: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2020-01-01T00:00:00.000Z',
    isMe: true,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2020-01-01T00:00:00.000Z',
    isMe: false,
  },
  {
    teamPlayerId: 'tp-3',
    playerId: 'player-3',
    firstName: 'Ines',
    lastName: 'Petit',
    role: 'COACH',
    convoked: true,
    convokedAt: '2020-01-01T00:00:00.000Z',
    isMe: false,
  },
];

const emptyResults: EventVoteResults = {
  best: [],
  worst: [],
  totalVoters: 3,
  votesCast: 0,
  myVote: { best: null, worst: null },
};

function mockData(results: EventVoteResults = emptyResults) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
      HttpResponse.json(roster),
    ),
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
      HttpResponse.json(results),
    ),
  );
}

describe('MatchVoteTab', () => {
  it('gates the ballot behind the vote window before it opens (1h after kickoff), without fetching anything', async () => {
    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={futureMatchEvent} />);

    expect(await screen.findByText('Le vote ouvrira après le match')).toBeInTheDocument();
  });

  it('shows a distinct message once the vote window has closed (5 days after kickoff)', async () => {
    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={closedMatchEvent} />);

    expect(await screen.findByText('Le vote est terminé')).toBeInTheDocument();
  });

  it('shows an error state with retry when either fetch fails', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json(emptyResults),
      ),
    );

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('excludes the voter themself from both ballot candidate lists', async () => {
    mockData();

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Bulletin de vote');
    expect(screen.queryByText('Lea Bernard')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nathan Hubert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ines Petit').length).toBeGreaterThan(0);
  });

  it('replaces the ballot with an explanation, and withholds results, for a viewer not marked present', async () => {
    mockData();
    const notPresentEvent: TeamEvent = { ...openMatchEvent, myRsvpStatus: 'NOT_GOING' };

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={notPresentEvent} />);

    await screen.findByText('Bulletin de vote');
    expect(screen.queryByRole('button', { name: /envoyer mon vote/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Nathan Hubert')).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Seul·e·s les joueur·euse·s marqué·e·s présent·e·s peuvent voter/i)
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Seul·e·s les joueur·euse·s présent·e·s au match peuvent voter/i).length,
    ).toBe(2);
  });

  it('disables submit until a BEST candidate is selected, and casts BEST then WORST on submit', async () => {
    mockData();
    const user = userEvent.setup();

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Bulletin de vote');
    const submitButton = screen.getByRole('button', { name: /envoyer mon vote/i });
    expect(submitButton).toBeDisabled();

    const bestRows = screen.getAllByText('Nathan Hubert');
    await user.click(bestRows[0]);
    expect(submitButton).not.toBeDisabled();

    const castBody: unknown[] = [];
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/votes', async ({ request }) => {
        const body = await request.json();
        castBody.push(body);
        return HttpResponse.json({
          ...emptyResults,
          myVote: { best: 'tp-2', worst: null },
        });
      }),
    );

    await user.click(submitButton);

    await waitFor(() => expect(castBody).toEqual([{ category: 'BEST', teamPlayerId: 'tp-2' }]));
    expect(await screen.findByText('Vote envoyé — merci !')).toBeInTheDocument();
  });

  it('shows an empty state when there are no other rostered candidates to vote for', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([roster[0]]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json(emptyResults),
      ),
    );

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    expect(await screen.findByText('Pas assez de joueurs à départager')).toBeInTheDocument();
  });

  it('withholds the leaderboards behind a "vote to see results" message before the caller has voted', async () => {
    mockData({
      best: [],
      worst: [],
      totalVoters: 3,
      votesCast: 3,
      myVote: { best: null, worst: null },
    });

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Meilleur joueur');
    expect(screen.getAllByText('Votez pour voir les résultats.').length).toBe(2);
  });

  it('renders the aggregated results leaderboards once the caller has voted', async () => {
    mockData({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 },
      ],
      worst: [{ teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 }],
      totalVoters: 3,
      votesCast: 3,
      myVote: { best: 'tp-2', worst: null },
    });

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Meilleur joueur');
    expect(screen.getByText('3 votes exprimés sur 3')).toBeInTheDocument();
    expect(screen.getByText('Joueur en difficulté — agrégé')).toBeInTheDocument();
    expect(screen.getByText('3 votes exprimés · réponse optionnelle')).toBeInTheDocument();
    expect(screen.queryByText('Votez pour voir les résultats.')).not.toBeInTheDocument();
  });
});
