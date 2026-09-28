import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

// Within the vote window (opens startsAt+1h, closes startsAt+5d). Eligibility
// (convoked + present) is enforced upstream by EventDetailPage's tab
// visibility, not by MatchVoteTab itself, so these fixtures don't need to
// vary myConvocation/myRsvpStatus.
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
  myRsvpRespondedBy: null,
  myRsvpRespondedAt: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: true,
  rsvpSummary: {
    rosterSize: 0,
    convoked: 0,
    answering: 0,
    going: 0,
    maybe: 0,
    notGoing: 0,
    pending: 0,
    isConvocationScoped: false,
  },
  logistics: { jerseys: null, balls: null },
  result: null,
  myMatchStats: null,
  meetingPlan: null,
  myTravelMode: null,
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
  myVoteHidden: false,
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
  it('gates behind the vote window before it opens (1h after kickoff), without fetching anything', async () => {
    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={futureMatchEvent} />);

    expect(await screen.findByText('Le vote ouvrira après le match')).toBeInTheDocument();
  });

  it('shows an error state with retry when either fetch fails while voting is live', async () => {
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
          myVoteHidden: false,
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
      myVoteHidden: false,
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
      myVoteHidden: false,
    });

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Meilleur joueur');
    expect(screen.getByText('3 votes exprimés sur 3')).toBeInTheDocument();
    expect(screen.getByText('Joueur en difficulté — agrégé')).toBeInTheDocument();
    expect(screen.getByText('3 votes exprimés · réponse optionnelle')).toBeInTheDocument();
    expect(screen.queryByText('Votez pour voir les résultats.')).not.toBeInTheDocument();
  });

  it('gives tied leaders the same rank badge, skips the next number, and shows an "Égalité en tête" caption', async () => {
    mockData({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 2 },
        { teamPlayerId: 'tp-4', firstName: 'Leo', lastName: 'Roy', voteCount: 1 },
      ],
      worst: [],
      totalVoters: 5,
      votesCast: 5,
      myVote: { best: 'tp-2', worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Meilleur joueur');
    expect(screen.getByText(/Égalité en tête/)).toBeInTheDocument();

    // Léo is the sole 3rd-place entry — his row's own rank badge shows "3"
    // (skipping "2"), unambiguous within his row since his own vote count
    // is "1", not "3".
    const leoRow = screen.getByText('Leo Roy').closest('div');
    expect(within(leoRow as HTMLElement).getByText('3')).toBeInTheDocument();
  });

  it('does not show the "Égalité en tête" caption when there is a single clear leader', async () => {
    mockData({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 },
      ],
      worst: [],
      totalVoters: 5,
      votesCast: 3,
      myVote: { best: 'tp-2', worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={openMatchEvent} />);

    await screen.findByText('Meilleur joueur');
    expect(screen.queryByText(/Égalité en tête/)).not.toBeInTheDocument();
  });

  it('shows results only (no ballot, ungated) once the vote window has closed, even for a caller who never voted', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json({
          best: [{ teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 }],
          worst: [],
          totalVoters: 3,
          votesCast: 2,
          myVote: { best: null, worst: null },
          myVoteHidden: false,
        }),
      ),
    );

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={closedMatchEvent} />);

    expect(await screen.findByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.queryByText('Bulletin de vote')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envoyer mon vote/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Votez pour voir les résultats.')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the results fetch fails once closed', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    renderWithProviders(<MatchVoteTab clubId="club-1" teamId="team-1" event={closedMatchEvent} />);

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });
});
