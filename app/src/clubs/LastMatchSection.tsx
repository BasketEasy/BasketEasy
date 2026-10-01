import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { Heading } from '@basketeasy/ui/heading';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import type { EventMatchResult } from '@basketeasy/types/events';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { formatEventDateOnly } from './eventDateFormat';
import { formatMvpNames } from './myAgendaVote';
import { formatCount } from './teamStatsFormat';

const OUTCOME: Record<
  EventMatchResult['outcome'],
  { label: string; tone: 'success' | 'danger' | 'neutral' }
> = {
  WIN: { label: 'Victoire', tone: 'success' },
  LOSS: { label: 'Défaite', tone: 'danger' },
  DRAW: { label: 'Match nul', tone: 'neutral' },
};

/**
 * The MVP tile: while the window is open and the reader has voted, the
 * turnout (the leader is still provisional); once closed, the winner.
 * Nothing before the reader has voted on an open window: the home never
 * shows a result earlier than the match page would. The « joueur en
 * difficulté » outcome never reaches the home.
 */
function MvpTile({ match }: { match: MyAgendaEvent }) {
  const vote = match.vote;
  if (!vote) return null;
  const icon = <TrophyIcon size="lg" aria-hidden="true" />;
  if (vote.hasVoted && new Date(vote.closesAt) > new Date()) {
    return (
      <FactTile
        icon={icon}
        label={
          <span className="tabular">
            Votes en cours · {vote.votesCast} / {vote.totalVoters}
          </span>
        }
        detail="MVP du match"
      />
    );
  }
  if (vote.mvp && vote.mvp.length > 0) {
    return <FactTile icon={icon} label={formatMvpNames(vote.mvp)} detail="MVP du match" />;
  }
  return null;
}

/**
 * « Dernier match »: the most recent played match of the last 30 days,
 * with the score, the reader's own line and the MVP. Its stats link lands on
 * the event page's « Après la rencontre ».
 */
export function LastMatchSection({ match }: { match: MyAgendaEvent }) {
  const eventHref = `/clubs/${match.clubId}/teams/${match.teamId}/events/${match.eventId}`;
  const stats = match.myMatchStats;
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading as="h2">Dernier match</SectionHeading>
      <Card variant="panel" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Text variant="eyebrow">
              {match.teamName} · {formatEventDateOnly(match.startsAt)}
            </Text>
            <Heading as="h3" size="2xl" className="m-0">
              {match.opponentName ? `vs ${match.opponentName}` : 'Match'}
            </Heading>
          </div>
          {match.result && (
            <div className="flex shrink-0 items-center gap-2">
              <Text as="span" variant="display" size="2xl" className="tabular">
                {match.result.ourScore}–{match.result.theirScore}
              </Text>
              <Badge tone={OUTCOME[match.result.outcome].tone}>
                {OUTCOME[match.result.outcome].label}
              </Badge>
            </div>
          )}
        </div>
        <FactTile
          icon={<ChartBarsIcon size="lg" aria-hidden="true" />}
          label={
            stats ? (
              <span className="tabular">
                {formatCount(stats.points)} pts · {formatCount(stats.fouls)} fautes
              </span>
            ) : (
              'Stats pas encore saisies'
            )
          }
          detail="Ma ligne"
        />
        <MvpTile match={match} />
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link to={`${eventHref}?tab=scoresheet`} state={{ origin: { from: 'dashboard' } }}>
            Stats du match
          </Link>
        </Button>
      </Card>
    </section>
  );
}
