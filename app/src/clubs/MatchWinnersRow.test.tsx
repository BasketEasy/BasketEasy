import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { EventVoteResults, TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchWinnersRow } from './MatchWinnersRow';

const DAY_MS = 24 * 60 * 60 * 1000;

const closedMatchEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: new Date(Date.now() - 6 * DAY_MS).toISOString(),
  location: 'Gymnase A',
  locationName: null,
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  myRsvpRespondedBy: null,
  myRsvpRespondedAt: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
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
  whatsAppShare: null,
  whatsAppSettings: null,
  myTravelMode: null,
};

const openMatchEvent: TeamEvent = {
  ...closedMatchEvent,
  startsAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
};

const trainingEvent: TeamEvent = {
  ...closedMatchEvent,
  type: 'TRAINING',
  opponentName: null,
  venue: null,
};

function mockVotes(results: EventVoteResults) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
      HttpResponse.json(results),
    ),
  );
}

describe('MatchWinnersRow', () => {
  it('renders nothing while the vote window is still open', () => {
    renderWithProviders(<MatchWinnersRow clubId="club-1" teamId="team-1" event={openMatchEvent} />);
    expect(screen.queryByText(/^-\s/)).not.toBeInTheDocument();
  });

  it('renders nothing for a TRAINING event', () => {
    renderWithProviders(<MatchWinnersRow clubId="club-1" teamId="team-1" event={trainingEvent} />);
    expect(screen.queryByText(/^-\s/)).not.toBeInTheDocument();
  });

  it('renders nothing once closed if nobody voted', async () => {
    mockVotes({
      best: [],
      worst: [],
      totalVoters: 4,
      votesCast: 0,
      myVote: { best: null, worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(
      <MatchWinnersRow clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    // Give the query a tick to resolve, then confirm nothing rendered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Nathan Hubert')).not.toBeInTheDocument();
  });

  it('shows the top BEST and top WORST with their share of votes cast, space-between', async () => {
    mockVotes({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 3 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 },
      ],
      worst: [{ teamPlayerId: 'tp-4', firstName: 'Sarah', lastName: 'Fabre', voteCount: 2 }],
      totalVoters: 4,
      votesCast: 4,
      myVote: { best: null, worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(
      <MatchWinnersRow clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.getByText('- 75%')).toBeInTheDocument();
    expect(screen.queryByText('Ines Petit')).not.toBeInTheDocument();
    expect(screen.getByText('Sarah Fabre')).toBeInTheDocument();
    expect(screen.getByText('50% -')).toBeInTheDocument();
  });

  it('omits the WORST side entirely when nobody cast a WORST vote', async () => {
    mockVotes({
      best: [{ teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 3 }],
      worst: [],
      totalVoters: 4,
      votesCast: 3,
      myVote: { best: null, worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(
      <MatchWinnersRow clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.getByText('- 100%')).toBeInTheDocument();
    expect(screen.queryByText('Sarah Fabre')).not.toBeInTheDocument();
  });

  it('shows "Égalité (N)" instead of a name when the BEST side is tied for 1st, independently of the WORST side', async () => {
    mockVotes({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 2 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 2 },
      ],
      worst: [{ teamPlayerId: 'tp-4', firstName: 'Sarah', lastName: 'Fabre', voteCount: 1 }],
      totalVoters: 4,
      votesCast: 3,
      myVote: { best: null, worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(
      <MatchWinnersRow clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Égalité (2)')).toBeInTheDocument();
    expect(screen.queryByText('Nathan Hubert')).not.toBeInTheDocument();
    expect(screen.queryByText('Ines Petit')).not.toBeInTheDocument();
    // WORST side has a single clear leader — unaffected by the BEST tie.
    expect(screen.getByText('Sarah Fabre')).toBeInTheDocument();
  });

  it('degrades to the tied count for 3+ tied candidates', async () => {
    mockVotes({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 1 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 },
        { teamPlayerId: 'tp-4', firstName: 'Sarah', lastName: 'Fabre', voteCount: 1 },
      ],
      worst: [],
      totalVoters: 5,
      votesCast: 3,
      myVote: { best: null, worst: null },
      myVoteHidden: false,
    });

    renderWithProviders(
      <MatchWinnersRow clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Égalité (3)')).toBeInTheDocument();
  });
});
