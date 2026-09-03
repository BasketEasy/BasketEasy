import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { renderWithProviders } from '../testUtils';
import { PastMatchesSection } from './PastMatchesSection';

const baseMatch: MyAgendaEvent = {
  eventId: 'event-1',
  teamId: 'team-1',
  teamName: 'U15 Filles',
  clubId: 'club-1',
  clubName: 'COC Basket',
  type: 'MATCH',
  startsAt: '2026-08-25T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  myRsvpStatus: 'GOING',
  myConvocation: true,
  rsvpSummary: {
    rosterSize: 12,
    convoked: 10,
    answering: 10,
    going: 8,
    maybe: 1,
    notGoing: 1,
    pending: 0,
    isConvocationScoped: true,
  },
  isImported: false,
  timeConfirmed: true,
  logistics: { jerseys: null, balls: null },
  result: null,
  myMatchStats: null,
};

function noop() {}

describe('PastMatchesSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a WIN badge and the score for a confirmed home win', () => {
    const match: MyAgendaEvent = {
      ...baseMatch,
      result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
    };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText('Victoire')).toBeInTheDocument();
    expect(screen.getByText('62–58')).toBeInTheDocument();
  });

  it('shows a LOSS badge for a confirmed loss', () => {
    const match: MyAgendaEvent = {
      ...baseMatch,
      result: { ourScore: 50, theirScore: 55, outcome: 'LOSS' },
    };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText('Défaite')).toBeInTheDocument();
  });

  it('shows a DRAW badge for a confirmed draw', () => {
    const match: MyAgendaEvent = {
      ...baseMatch,
      result: { ourScore: 60, theirScore: 60, outcome: 'DRAW' },
    };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText('Match nul')).toBeInTheDocument();
  });

  it('renders no score or outcome badge for a match with no confirmed scoresheet yet, but still links to it', () => {
    renderWithProviders(
      <PastMatchesSection
        matches={[baseMatch]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.queryByText('Victoire')).not.toBeInTheDocument();
    expect(screen.queryByText('Défaite')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-1',
    );
  });

  it("shows the caller's own points and fouls when myMatchStats is present", () => {
    const match: MyAgendaEvent = {
      ...baseMatch,
      result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
      myMatchStats: { points: 14, fouls: 3 },
    };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText(/14 pts/)).toBeInTheDocument();
    expect(screen.getByText(/3 fautes/)).toBeInTheDocument();
  });

  it('renders an em dash for a known-unread myMatchStats field, never 0', () => {
    const match: MyAgendaEvent = {
      ...baseMatch,
      result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
      myMatchStats: { points: null, fouls: null },
    };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText(/— pts/)).toBeInTheDocument();
    expect(screen.getByText(/— fautes/)).toBeInTheDocument();
  });

  it('shows a "Voter" link while the vote window is open', () => {
    // Match started 2026-08-25T18:00, "now" is 2026-08-27T12:00 — inside the
    // 1h-to-5-day window (see voteWindow.ts).
    renderWithProviders(
      <PastMatchesSection
        matches={[baseMatch]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByRole('link', { name: /voter/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-1?tab=vote',
    );
  });

  it('hides the "Voter" link once the vote window has closed', () => {
    const match: MyAgendaEvent = { ...baseMatch, startsAt: '2026-08-01T18:00:00.000Z' };
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.queryByRole('link', { name: /voter/i })).not.toBeInTheDocument();
  });

  it('shows an error state with a working retry', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <PastMatchesSection
        matches={[]}
        isLoading={false}
        isError
        onRetry={onRetry}
        isRefetching={false}
      />,
    );

    expect(screen.getByText('Après le match')).toBeInTheDocument();
    screen.getByRole('button', { name: /réessayer/i }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows a loading skeleton', () => {
    renderWithProviders(
      <PastMatchesSection
        matches={[]}
        isLoading
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.getByText('Après le match')).toBeInTheDocument();
  });

  it('renders nothing when there are no past matches and no emptyState is given', () => {
    const { container } = renderWithProviders(
      <PastMatchesSection
        matches={[]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the given emptyState when there are no past matches', () => {
    renderWithProviders(
      <PastMatchesSection
        matches={[]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
        emptyState={<p>Rien à afficher</p>}
      />,
    );

    expect(screen.getByText('Après le match')).toBeInTheDocument();
    expect(screen.getByText('Rien à afficher')).toBeInTheDocument();
  });
});
