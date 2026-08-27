import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchWinnersCard } from './MatchWinnersCard';

const DAY_MS = 24 * 60 * 60 * 1000;

const closedMatchEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: new Date(Date.now() - 6 * DAY_MS).toISOString(),
  location: 'Gymnase A',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
  logistics: { jerseys: null, balls: null },
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

function mockVotes(results: unknown) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/votes', () =>
      HttpResponse.json(results),
    ),
  );
}

describe('MatchWinnersCard', () => {
  it('renders nothing while the vote window is still open', () => {
    renderWithProviders(
      <MatchWinnersCard clubId="club-1" teamId="team-1" event={openMatchEvent} />,
    );
    expect(screen.queryByText('Meilleur joueur')).not.toBeInTheDocument();
  });

  it('renders nothing for a TRAINING event', () => {
    renderWithProviders(<MatchWinnersCard clubId="club-1" teamId="team-1" event={trainingEvent} />);
    expect(screen.queryByText('Meilleur joueur')).not.toBeInTheDocument();
  });

  it('renders nothing once closed if nobody voted', async () => {
    mockVotes({
      best: [],
      worst: [],
      totalVoters: 4,
      votesCast: 0,
      myVote: { best: null, worst: null },
    });

    renderWithProviders(
      <MatchWinnersCard clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    // Give the query a tick to resolve, then confirm nothing rendered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Meilleur joueur')).not.toBeInTheDocument();
  });

  it('shows the top BEST and top WORST once closed', async () => {
    mockVotes({
      best: [
        { teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 3 },
        { teamPlayerId: 'tp-3', firstName: 'Ines', lastName: 'Petit', voteCount: 1 },
      ],
      worst: [{ teamPlayerId: 'tp-4', firstName: 'Sarah', lastName: 'Fabre', voteCount: 2 }],
      totalVoters: 4,
      votesCast: 4,
      myVote: { best: null, worst: null },
    });

    renderWithProviders(
      <MatchWinnersCard clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Meilleur joueur')).toBeInTheDocument();
    expect(screen.getByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.queryByText('Ines Petit')).not.toBeInTheDocument();
    expect(screen.getByText('Joueur en difficulté')).toBeInTheDocument();
    expect(screen.getByText('Sarah Fabre')).toBeInTheDocument();
  });

  it('omits the "difficulté" line when nobody cast a WORST vote', async () => {
    mockVotes({
      best: [{ teamPlayerId: 'tp-2', firstName: 'Nathan', lastName: 'Hubert', voteCount: 3 }],
      worst: [],
      totalVoters: 4,
      votesCast: 3,
      myVote: { best: null, worst: null },
    });

    renderWithProviders(
      <MatchWinnersCard clubId="club-1" teamId="team-1" event={closedMatchEvent} />,
    );

    expect(await screen.findByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.queryByText('Joueur en difficulté')).not.toBeInTheDocument();
  });
});
