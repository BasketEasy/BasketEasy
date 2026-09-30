import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { EventMatchResult } from '@basketeasy/types/events';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { formatEventDate } from './eventDateFormat';
import { formatCount } from './teamStatsFormat';
import { isVoteWindowOpen } from './voteWindow';
import { eventVenueLabel } from '@basketeasy/types/events';

const OUTCOME_BADGE_TONE: Record<EventMatchResult['outcome'], 'success' | 'danger' | 'neutral'> = {
  WIN: 'success',
  LOSS: 'danger',
  DRAW: 'neutral',
};

const OUTCOME_LABEL: Record<EventMatchResult['outcome'], string> = {
  WIN: 'Victoire',
  LOSS: 'Défaite',
  DRAW: 'Match nul',
};

/**
 * One played match on « Après le match ». `result`/`myMatchStats` land here
 * in phase 8 — until a manager confirms the scoresheet, `result` stays null
 * and the row is just a link back to the match (so a manager still has
 * something to click through to go confirm it); a player must never see an
 * unconfirmed score (CLAUDE.md, Scoresheets module), so there is no
 * "provisional" score rendered here either.
 *
 * The vote CTA reuses `isVoteWindowOpen` (`./voteWindow`) — the same hard
 * window `EventsService.castVote` enforces server-side and `EventVoteBadge`
 * already surfaces on the team agenda — rather than re-deriving it. It links
 * into the event page's existing vote section (`?tab=vote`, resolved by
 * `useEventSectionAnchor`) rather than building a new vote surface here.
 */
function PastMatchRow({ match }: { match: MyAgendaEvent }) {
  const eventHref = `/clubs/${match.clubId}/teams/${match.teamId}/events/${match.eventId}`;
  const navState = { origin: { from: 'dashboard' } };

  return (
    <Card variant="inset" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="span" variant="label" size="sm">
            {formatEventDate(match.startsAt)}
            {match.opponentName ? ` · vs ${match.opponentName}` : ''}
          </Text>
          <Text as="span" variant="meta" size="xs">
            {match.teamName} · {eventVenueLabel(match)}
          </Text>
          {match.myMatchStats && (
            <Text as="span" variant="meta" size="xs">
              {formatCount(match.myMatchStats.points)} pts · {formatCount(match.myMatchStats.fouls)}{' '}
              fautes
            </Text>
          )}
        </div>
        {match.result && (
          <div className="flex shrink-0 items-center gap-2">
            <Text as="span" variant="display" size="md" className="tabular">
              {match.result.ourScore}–{match.result.theirScore}
            </Text>
            <Badge tone={OUTCOME_BADGE_TONE[match.result.outcome]}>
              {OUTCOME_LABEL[match.result.outcome]}
            </Badge>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <TextLink asChild tone="brand">
          <Link to={eventHref} state={navState}>
            Voir →
          </Link>
        </TextLink>
        {isVoteWindowOpen(match.startsAt) && (
          <TextLink asChild tone="brand">
            <Link to={`${eventHref}?tab=vote`} state={navState}>
              Voter →
            </Link>
          </TextLink>
        )}
      </div>
    </Card>
  );
}

/**
 * « Après le match » — the post-match surface both homes render as a
 * preview and `/results` renders as the full list, all three reading the
 * same `pastMatchesWindowParams()`-windowed `useMyAgenda()` query and
 * passing it through here (`docs/ux-audit/player-first-implementation-plan.md`
 * §2 Phase 8). One component, three call sites — same "one component per
 * record" rule `MyAgendaEventCard` already follows for the upcoming agenda.
 *
 * Query branches: `error → loading → empty → data`. `emptyState` is
 * `undefined` by default — the two home previews render nothing at all when
 * there's simply nothing in the last 30 days, since "no recent match" is a
 * normal, unremarkable state for a preview block, not worth a dedicated
 * empty state repeated on every home screen. `/results`, whose entire
 * purpose is this list, passes its own `EmptyState` for that case instead.
 */
export function PastMatchesSection({
  matches,
  isLoading,
  isError,
  onRetry,
  isRefetching,
  emptyState,
}: {
  matches: MyAgendaEvent[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isRefetching: boolean;
  emptyState?: ReactNode;
}) {
  if (isError) {
    return (
      <section className="flex flex-col gap-3.5">
        <SectionHeading as="h2">Après le match</SectionHeading>
        <QueryError onRetry={onRetry} isRetrying={isRefetching} />
      </section>
    );
  }
  if (isLoading) {
    return (
      <section className="flex flex-col gap-3.5">
        <SectionHeading as="h2">Après le match</SectionHeading>
        <SkeletonList rows={1} variant="card" />
      </section>
    );
  }
  if (matches.length === 0) {
    return emptyState ? (
      <section className="flex flex-col gap-3.5">
        <SectionHeading as="h2">Après le match</SectionHeading>
        {emptyState}
      </section>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading as="h2">Après le match</SectionHeading>
      <div className="flex flex-col gap-2">
        {matches.map((match) => (
          <PastMatchRow key={match.eventId} match={match} />
        ))}
      </div>
    </section>
  );
}
