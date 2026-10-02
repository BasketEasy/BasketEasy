import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { renderWithProviders } from '../testUtils';
import { TeamNextEventTile } from './TeamNextEventTile';

function renderTile(event: TeamEvent, showMyAnswer = false) {
  return renderWithProviders(
    <TeamNextEventTile
      clubId="club-1"
      teamId="team-1"
      event={event}
      showMyAnswer={showMyAnswer}
      navState={undefined}
    />,
  );
}

function matchEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: '2026-09-05T20:30:00',
    location: 'Gymnase A',
    opponentName: 'ESB Rezé',
    myRsvpStatus: null,
    timeConfirmed: true,
    ...overrides,
  } as TeamEvent;
}

describe('TeamNextEventTile', () => {
  it('names the opponent of a match', () => {
    renderTile(matchEvent());

    expect(screen.getByText(/vs ESB Rezé/)).toBeInTheDocument();
  });

  it('never prints « vs null » when the opponent is not known yet', () => {
    renderTile(matchEvent({ opponentName: null }));

    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });

  it('labels a training', () => {
    renderTile(matchEvent({ type: 'TRAINING', opponentName: null }));

    expect(screen.getByText(/Entraînement/)).toBeInTheDocument();
  });

  it('shows « Sans réponse » when the reader has not answered', () => {
    renderTile(matchEvent(), true);

    expect(screen.getByText(/Sans réponse/)).toBeInTheDocument();
  });
});
