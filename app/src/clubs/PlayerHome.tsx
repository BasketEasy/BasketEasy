import { useMemo } from 'react';
import { EmptyState } from '@basketeasy/ui/empty-state';
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
 * Block order follows §4.1: where am I going next → what do I owe an answer
 * on → what's coming → what just happened. The stat tiles, the "Mes équipes"
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
 * The hero, « À répondre » and « Les 14 prochains jours » are three views of
 * the *same* query (`dashboard`, windowed to 14 days by the page) — one
 * error/loading ladder for all three, surfaced once on the hero, rather than
 * the same retry button rendered three times. « Après le match » reads a
 * second, independent query and owns its own ladder.
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

  // Computed once per mount, not inline: `pastMatchesWindowParams()` stamps
  // `from`/`to` with `new Date()`, so recomputing it every render would shift
  // the query key by a few milliseconds each time and refetch forever.
  const pastWindow = useMemo(() => pastMatchesWindowParams(), []);
  const pastMatchesQuery = useMyAgenda(pastWindow);
  const pastMatches = (pastMatchesQuery.data?.upcomingEvents ?? []).filter(
    (event) => event.type === 'MATCH',
  );

  return (
    <>
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

      {hasAgendaData && awaitingResponse.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2" count={awaitingResponse.length}>
            À répondre
          </SectionHeading>
          <div className="flex flex-col gap-2">
            {awaitingResponse.map((event) => (
              <MyAgendaEventCard key={event.eventId} event={event} isRostered />
            ))}
          </div>
        </section>
      )}

      {hasAgendaData && upcomingEvents.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeading as="h2">Les 14 prochains jours</SectionHeading>
          {groupByDay(upcomingEvents).map(([key, dayEvents]) => (
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
        matches={pastMatches}
        isLoading={pastMatchesQuery.isLoading}
        isError={pastMatchesQuery.isError}
        onRetry={() => pastMatchesQuery.refetch()}
        isRefetching={pastMatchesQuery.isRefetching}
      />
    </>
  );
}
