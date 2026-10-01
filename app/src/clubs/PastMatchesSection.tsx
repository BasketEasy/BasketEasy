import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { List, ListItem } from '@basketeasy/ui/list';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import type { EventMatchResult } from '@basketeasy/types/events';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { formatEventDate } from './eventDateFormat';
import { formatCount } from './teamStatsFormat';
import { formatMvpNames } from './myAgendaVote';

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
 * One played match as a link row (design rule 8): « vs {opponent} · score »,
 * « {team} · {date} », the outcome badge and a chevron, the whole row being
 * the link back to the match. Until a manager confirms the scoresheet,
 * `result` stays null and the row is just that link (so a manager still has
 * something to click through to go confirm it); a player must never see an
 * unconfirmed score (CLAUDE.md, Scoresheets module), so there is no
 * "provisional" score rendered here either.
 *
 * The vote state comes from the server (`MyAgendaEvent.vote`): a « Voter »
 * badge (and a link straight into the event page's vote section,
 * `?tab=vote`, resolved by `useEventSectionAnchor`) only when this reader can
 * vote and hasn't, « A voté » once they have while the window is still open,
 * and the MVP as a meta line once it is public to them. The « joueur en
 * difficulté » outcome never appears here.
 */
function PastMatchRow({ match }: { match: MyAgendaEvent }) {
  const eventHref = `/clubs/${match.clubId}/teams/${match.teamId}/events/${match.eventId}`;
  const vote = match.vote;
  const mvp = vote?.mvp && vote.mvp.length > 0 ? formatMvpNames(vote.mvp) : null;
  const isVoteOpen = !!vote && new Date(vote.closesAt) > new Date();
  const mustVote = !!vote?.canVote && !vote.hasVoted;
  const opponent = match.opponentName ? `vs ${match.opponentName}` : 'Match joué';

  return (
    <ListItem
      asChild
      chevron
      meta={[
        `${match.teamName} · ${formatEventDate(match.startsAt)}`,
        match.myMatchStats &&
          `${formatCount(match.myMatchStats.points)} pts · ${formatCount(match.myMatchStats.fouls)} fautes`,
        mvp && `MVP : ${mvp}`,
      ]}
      trailing={
        <>
          {match.result && (
            <Badge tone={OUTCOME_BADGE_TONE[match.result.outcome]}>
              {OUTCOME_LABEL[match.result.outcome]}
            </Badge>
          )}
          {mustVote && <Badge tone="brand">Voter</Badge>}
          {vote?.hasVoted && isVoteOpen && (
            <Badge variant="soft" tone="muted">
              A voté
            </Badge>
          )}
        </>
      }
    >
      <Link
        to={mustVote ? `${eventHref}?tab=vote` : eventHref}
        state={{ origin: { from: 'dashboard' } }}
      >
        {opponent}
        {match.result && (
          <>
            {' · '}
            <span className="tabular whitespace-nowrap">
              {match.result.ourScore}–{match.result.theirScore}
            </span>
          </>
        )}
      </Link>
    </ListItem>
  );
}

/**
 * « Après le match » — the post-match surface both homes render as a
 * preview and `/results` renders as the full list, all three reading the
 * same `pastMatchesWindowParams()`-windowed `useMyAgenda()` query and
 * passing it through here. One component, three call sites — same "one component per
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
  title = 'Après le match',
  headingless = false,
  footer,
}: {
  matches: MyAgendaEvent[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isRefetching: boolean;
  emptyState?: ReactNode;
  /** The section's court-line label; the player home calls it « Derniers résultats ». */
  title?: string;
  /** Drops the court-line label when the page already carries the title (`/results`). */
  headingless?: boolean;
  /** Rendered under the list, e.g. a link to the full `/results` page. */
  footer?: ReactNode;
}) {
  const heading = headingless ? null : <SectionHeading as="h2">{title}</SectionHeading>;
  if (isError) {
    return (
      <section className="flex flex-col gap-3.5">
        {heading}
        <QueryError onRetry={onRetry} isRetrying={isRefetching} />
      </section>
    );
  }
  if (isLoading) {
    return (
      <section className="flex flex-col gap-3.5">
        {heading}
        <SkeletonList rows={1} variant="card" />
      </section>
    );
  }
  if (matches.length === 0) {
    return emptyState ? (
      <section className="flex flex-col gap-3.5">
        {heading}
        {emptyState}
      </section>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-3.5">
      {heading}
      <Card variant="flush">
        <List>
          {matches.map((match) => (
            <PastMatchRow key={match.eventId} match={match} />
          ))}
        </List>
      </Card>
      {footer}
    </section>
  );
}
