import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { EventVoteBadge } from './EventVoteBadge';

const baseEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: '2026-08-25T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'AWAY',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
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
};

describe('EventVoteBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the days-remaining badge for a past MATCH still inside the vote window', () => {
    render(<EventVoteBadge event={baseEvent} />);
    expect(screen.getByText(/votes ouverts/i)).toBeInTheDocument();
  });

  it('renders nothing for a TRAINING event', () => {
    render(<EventVoteBadge event={{ ...baseEvent, type: 'TRAINING', venue: null }} />);
    expect(screen.queryByText(/votes ouverts/i)).not.toBeInTheDocument();
  });

  it('renders nothing before the match has started', () => {
    render(<EventVoteBadge event={{ ...baseEvent, startsAt: '2026-09-01T18:00:00.000Z' }} />);
    expect(screen.queryByText(/votes ouverts/i)).not.toBeInTheDocument();
  });

  it('renders nothing within the first hour after kickoff', () => {
    render(<EventVoteBadge event={{ ...baseEvent, startsAt: '2026-08-27T11:30:00.000Z' }} />);
    expect(screen.queryByText(/votes ouverts/i)).not.toBeInTheDocument();
  });

  it('renders nothing once the vote window has closed', () => {
    render(<EventVoteBadge event={{ ...baseEvent, startsAt: '2026-08-01T18:00:00.000Z' }} />);
    expect(screen.queryByText(/votes ouverts/i)).not.toBeInTheDocument();
  });
});
