import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { TextLink } from '@basketeasy/ui/text-link';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import type { MyAgendaEvent, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { eventDayKey, formatDayHeading } from './eventDateFormat';
import { MyAgendaEventCard } from './MyAgendaEventCard';
import { PastMatchesSection } from './PastMatchesSection';
import { pastMatchesWindowParams } from './myAgendaWindow';
import { useMyAgenda } from './useMyAgenda';
import { useMyTeamList } from './useMyTeamList';
import { useMySeasonSnapshots } from './useMySeasonSnapshots';
import { LastMatchSection } from './LastMatchSection';
import { MySeasonSection } from './MySeasonSection';

/** « Derniers résultats » on the home, after « Dernier match »: the full list is `/results`. */
const RECENT_RESULTS_LIMIT = 3;

const closesAtFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/**
 * Groups events by local calendar day, preserving arrival order. The same
 * approach `TeamEventsAgenda` uses for a single team's agenda, reimplemented
 * here rather than shared: that component is keyed to `TeamEvent` (a
 * structurally different shape — venue, timeConfirmed, logistics) and never
 * prints a team name, which a cross-team agenda needs on every row.
 */
function groupByDay(events: MyAgendaEvent[]): [string, MyAgendaEvent[]][] {
  const groups = new Map<string, MyAgendaEvent[]>();
  for (const event of events) {
    const group = groups.get(eventDayKey(event.startsAt));
    if (group) {
      group.push(event);
    } else {
      groups.set(eventDayKey(event.startsAt), [event]);
    }
  }
  return Array.from(groups.entries());
}

/**
 * The player's « Ma semaine » — an agenda-first to-do list, not a status
 * readout. `player-journey.md` §3.3 found the previous home screen printing
 * two counters ("Événements — 7 prochains jours", "En attente de réponse")
 * above content a player had to leave the page to act on; every block here
 * either answers a question directly or is the action itself.
 *
 * Block order (`2026-09-30-screen-consistency-player-home.md` §3): what do I
 * owe (a vote, an answer) → where am I going next (and how I get there) →
 * the last match and my season → what's coming → the other recent results. The stat tiles, the "Mes équipes"
 * grid (the bottom nav's team tab owns that destination now) and the raw
 * e-mail line under the greeting are gone for this persona — none of them
 * was a thing to do.
 *
 * Every event in `dashboard.upcomingEvents` is guaranteed rostered here:
 * this view only renders when `useHasManageRights()` is false, which means
 * the caller holds no `TeamAdmin` grant anywhere, and
 * `DashboardService.getDashboard` only ever includes a team when the caller
 * administers it or is rostered on it — so with no admin grants, every team
 * in this payload comes from the caller's own roster.
 *
 * The hero, the unanswered events of « À faire » and « Les 14 prochains
 * jours » are three views of the *same* query (`dashboard`, windowed to 14
 * days by the page) — one error/loading ladder for all three, surfaced once
 * on the hero. The owed votes, « Dernier match » and « Derniers résultats »
 * read a second, 30-day query whose ladder `PastMatchesSection` owns; « Ma
 * saison » reads the team season endpoint and owns one ladder per team. The
 * « joueur en difficulté » vote never appears anywhere on this page.
 */
export function PlayerHome({
  dashboard,
  isDashboardLoading,
  isDashboardError,
  refetchDashboard,
  isDashboardRefetching,
}: {
  dashboard: MyDashboardSummary | undefined;
  isDashboardLoading: boolean;
  isDashboardError: boolean;
  refetchDashboard: () => void;
  isDashboardRefetching: boolean;
}) {
  const upcomingEvents = dashboard?.upcomingEvents ?? [];
  const nextEvent = upcomingEvents[0];
  // Convocations first, per §4.1 — a call-up is the more expensive answer to
  // owe. Array.prototype.sort is stable, so the ascending date order the
  // server already returns survives within each partition.
  const awaitingResponse = [...upcomingEvents]
    .filter((event) => event.myRsvpStatus === null)
    .sort((a, b) => Number(b.myConvocation) - Number(a.myConvocation));
  const hasAgendaData = !isDashboardError && !isDashboardLoading;
  // The hero already shows the next event; the agenda below starts after it.
  const laterEvents = upcomingEvents.slice(1);

  // Computed once per mount, not inline: `pastMatchesWindowParams()` stamps
  // `from`/`to` with `new Date()`, so recomputing it every render would shift
  // the query key by a few milliseconds each time and refetch forever.
  const pastWindow = useMemo(() => pastMatchesWindowParams(), []);
  const pastMatchesQuery = useMyAgenda(pastWindow);
  // Most recent first: the newest is « Dernier match », the next three are
  // « Derniers résultats ».
  const pastMatches = (pastMatchesQuery.data?.upcomingEvents ?? [])
    .filter((event) => event.type === 'MATCH')
    .reverse();
  const hasPastData = !pastMatchesQuery.isError && !pastMatchesQuery.isLoading;
  const lastMatch = hasPastData ? pastMatches[0] : undefined;
  const owedVotes = pastMatches.filter((match) => match.vote?.canVote && !match.vote.hasVoted);

  const { data: myTeams } = useMyTeamList();
  const seasonSnapshots = useMySeasonSnapshots(myTeams);

  const toDoCount =
    (hasPastData ? owedVotes.length : 0) + (hasAgendaData ? awaitingResponse.length : 0);

  return (
    <>
      {toDoCount > 0 && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2" count={toDoCount}>
            À faire
          </SectionHeading>
          <div className="flex flex-col gap-2">
            {hasPastData &&
              owedVotes.map((match) => <OwedVoteTile key={match.eventId} match={match} />)}
            {hasAgendaData &&
              awaitingResponse.map((event) => (
                <MyAgendaEventCard key={event.eventId} event={event} isRostered />
              ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3.5">
        <SectionHeading as="h2">Prochain rendez-vous</SectionHeading>
        {isDashboardError ? (
          <QueryError onRetry={() => refetchDashboard()} isRetrying={isDashboardRefetching} />
        ) : isDashboardLoading ? (
          <SkeletonList rows={1} variant="card" />
        ) : nextEvent ? (
          <MyAgendaEventCard event={nextEvent} isRostered size="hero" />
        ) : (
          <EmptyState
            icon={<CalendarIcon tone="secondary" className="h-8 w-8" />}
            title="Rien de prévu"
            description="Aucun événement prévu dans les 14 prochains jours pour vos équipes."
          />
        )}
      </section>

      {(lastMatch || seasonSnapshots.length > 0) && (
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start">
          {lastMatch && <LastMatchSection match={lastMatch} />}
          <MySeasonSection snapshots={seasonSnapshots} teams={myTeams} />
        </div>
      )}

      {hasAgendaData && laterEvents.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeading as="h2">Les 14 prochains jours</SectionHeading>
          {groupByDay(laterEvents).map(([key, dayEvents]) => (
            <div key={key} className="flex flex-col gap-2">
              <Text as="span" variant="eyebrow">
                {formatDayHeading(dayEvents[0].startsAt)}
              </Text>
              {dayEvents.map((event) => (
                <MyAgendaEventCard key={event.eventId} event={event} isRostered />
              ))}
            </div>
          ))}
        </section>
      )}

      <PastMatchesSection
        title="Derniers résultats"
        matches={pastMatches.slice(1, 1 + RECENT_RESULTS_LIMIT)}
        isLoading={pastMatchesQuery.isLoading}
        isError={pastMatchesQuery.isError}
        onRetry={() => pastMatchesQuery.refetch()}
        isRefetching={pastMatchesQuery.isRefetching}
        footer={
          pastMatches.length > 1 + RECENT_RESULTS_LIMIT ? (
            <TextLink asChild tone="brand">
              <Link to="/results" className="self-start">
                Tous les résultats →
              </Link>
            </TextLink>
          ) : undefined
        }
      />
    </>
  );
}

/** A vote the reader owes: the one thing on the home only they can do about a played match. */
function OwedVoteTile({ match }: { match: MyAgendaEvent }) {
  const eventHref = `/clubs/${match.clubId}/teams/${match.teamId}/events/${match.eventId}`;
  return (
    <FactTile
      tone="accent"
      icon={<TrophyIcon aria-hidden="true" className="h-5 w-5" />}
      label={`Votez pour le MVP${match.opponentName ? ` · vs ${match.opponentName}` : ''}`}
      detail={
        match.vote
          ? `Ferme le ${closesAtFormatter.format(new Date(match.vote.closesAt))}`
          : undefined
      }
      actions={
        <Button asChild size="sm" className="flex-1">
          <Link to={`${eventHref}?tab=vote`} state={{ origin: { from: 'dashboard' } }}>
            Voter
          </Link>
        </Button>
      }
    />
  );
}
