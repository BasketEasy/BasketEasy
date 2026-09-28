import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { renderWithProviders } from '../testUtils';
import { EventDecisionBand } from './EventDecisionBand';
import { countEventRoster, type EventRosterCounts, type EventRosterRow } from './useEventRoster';

function baseEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: '2026-09-05T18:30:00.000Z',
    location: 'Gymnase du Vigneau',
    notes: null,
    opponentName: 'ESB Rezé',
    venue: 'HOME',
    recurrenceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    myRsvpStatus: null,
    myRsvpRespondedBy: null,
    myRsvpRespondedAt: null,
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
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    result: null,
    myMatchStats: null,
    meetingPlan: null,
    myTravelMode: null,
    ...overrides,
  };
}

function counts(convokedCount: number) {
  const rows: EventRosterRow[] = Array.from({ length: 15 }, (_, i) => ({
    teamPlayerId: `tp-${i}`,
    firstName: 'Joueuse',
    lastName: `N${i}`,
    role: 'PLAYER' as const,
    isMe: false,
    rsvpStatus: null,
    travelMode: null,
    convoked: i < convokedCount,
  }));
  return countEventRoster(rows);
}

function renderBand(event: TeamEvent, rosterCounts: EventRosterCounts | null = counts(12)) {
  return renderWithProviders(
    <EventDecisionBand clubId="club-1" teamId="team-1" event={event} counts={rosterCounts} />,
  );
}

describe('EventDecisionBand', () => {
  it('states the call-up as a sentence with the size of the group, not a bare badge', () => {
    renderBand(baseEvent({ myConvocation: true }));

    expect(screen.getByText('Vous êtes convoqué·e')).toBeInTheDocument();
    expect(
      screen.getByText('Le coach vous a retenu·e dans le groupe des 12 pour cette rencontre.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vous n’avez pas encore répondu.')).toBeInTheDocument();
  });

  it('says plainly when the viewer is not in the group', () => {
    renderBand(baseEvent({ myConvocation: false }));

    expect(screen.queryByText('Vous êtes convoqué·e')).not.toBeInTheDocument();
    expect(
      screen.getByText('Vous n’êtes pas dans le groupe des 12 retenu·es pour cette rencontre.'),
    ).toBeInTheDocument();
  });

  it('does not invent a group before one has been named', () => {
    renderBand(baseEvent(), counts(0));

    expect(
      screen.getByText('Le groupe n’a pas encore été annoncé pour cette rencontre.'),
    ).toBeInTheDocument();
  });

  it('degrades to the count-less sentence while the roster call has not landed', () => {
    renderBand(baseEvent({ myConvocation: true, type: 'TRAINING', opponentName: null }), null);

    expect(
      screen.getByText('Le coach vous a retenu·e dans le groupe pour cette séance.'),
    ).toBeInTheDocument();
  });

  it('reads the existing answer back, and offers the three answers inline', () => {
    renderBand(baseEvent({ myConvocation: true, myRsvpStatus: 'GOING' }));

    expect(screen.getByText('Votre réponse : oui.')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Ma réponse' });
    expect(group).toBeInTheDocument();
    // The decision is a single-field, high-frequency answer — inline, never a
    // dialog (CLAUDE.md, "Modals vs. inline editing").
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
