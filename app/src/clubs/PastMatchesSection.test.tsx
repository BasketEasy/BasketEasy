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
  locationName: null,
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  myRsvpStatus: 'GOING',
  myRsvpRespondedBy: null,
  myRsvpRespondedAt: null,
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
  vote: {
    canVote: true,
    hasVoted: false,
    closesAt: '2026-08-30T18:00:00.000Z',
    votesCast: 3,
    totalVoters: 12,
    mvp: null,
  },
  meetingPlan: null,
  myTravelMode: null,
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
        matches={[{ ...baseMatch, vote: null }]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );

    expect(screen.queryByText('Victoire')).not.toBeInTheDocument();
    expect(screen.queryByText('Défaite')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vs ES Rezé/ })).toHaveAttribute(
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

  function renderWith(props: {
    matches: MyAgendaEvent[];
    isError?: boolean;
    headingless?: boolean;
  }) {
    renderWithProviders(
      <PastMatchesSection
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
        {...props}
      />,
    );
  }

  function renderMatch(match: MyAgendaEvent) {
    renderWithProviders(
      <PastMatchesSection
        matches={[match]}
        isLoading={false}
        isError={false}
        onRetry={noop}
        isRefetching={false}
      />,
    );
  }

  it('is one link row: title with score, « équipe · date » meta, badge, in a single list', () => {
    renderMatch({
      ...baseMatch,
      vote: null,
      result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
    });

    expect(screen.getAllByRole('list')).toHaveLength(1);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/vs ES Rezé · 62–58/);
    expect(link).toHaveTextContent(/U15 Filles · /);
    expect(link).toHaveTextContent('Victoire');
  });

  it('hides the heading when headingless', () => {
    renderWith({ matches: [baseMatch], headingless: true });
    expect(screen.queryByText('Après le match')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('hides the heading when headingless on error too', () => {
    renderWith({ matches: [], isError: true, headingless: true });
    expect(screen.queryByText('Après le match')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('shows « Voter » when the server says this reader can vote and has not', () => {
    renderMatch(baseMatch);

    expect(screen.getByRole('link', { name: /voter/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-1?tab=vote',
    );
  });

  it('hides « Voter » from a reader who cannot vote (not convoked, not GOING, a parent)', () => {
    renderMatch({ ...baseMatch, vote: { ...baseMatch.vote!, canVote: false } });

    expect(screen.queryByRole('link', { name: /voter/i })).not.toBeInTheDocument();
  });

  it('shows « A voté » instead of « Voter » once the reader voted, while the window is open', () => {
    renderMatch({
      ...baseMatch,
      vote: {
        ...baseMatch.vote!,
        hasVoted: true,
        mvp: [{ firstName: 'Karim', lastInitial: 'D', isMe: false }],
      },
    });

    expect(screen.queryByRole('link', { name: /voter/i })).not.toBeInTheDocument();
    expect(screen.getByText('A voté')).toBeInTheDocument();
    expect(screen.getByText('MVP : Karim D.')).toBeInTheDocument();
  });

  it('keeps the MVP hidden while it is not public to the reader', () => {
    renderMatch(baseMatch);

    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument();
  });

  it('shows the MVP and no vote control once the window has closed', () => {
    renderMatch({
      ...baseMatch,
      startsAt: '2026-08-01T18:00:00.000Z',
      vote: {
        ...baseMatch.vote!,
        canVote: false,
        closesAt: '2026-08-06T18:00:00.000Z',
        mvp: [{ firstName: 'Léa', lastInitial: 'M', isMe: true }],
      },
    });

    expect(screen.queryByRole('link', { name: /voter/i })).not.toBeInTheDocument();
    expect(screen.queryByText('A voté')).not.toBeInTheDocument();
    expect(screen.getByText('MVP : Vous !')).toBeInTheDocument();
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
