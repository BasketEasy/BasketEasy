import { Card, CardContent } from '@basketeasy/ui/card';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import type { TeamEvent } from '@basketeasy/types/events';
import { TeamEventsAgenda } from './TeamEventsAgenda';

/**
 * The player's Événements tab, labelled « Agenda » — the day-grouped view
 * only. Unlike `TeamEventsTab` (the manager's power view), there is no
 * Agenda/Liste toggle and no paginated table: a rostered player has no use
 * for either (`docs/ux-audit/player-journey.md` §3.9, §4.4), so instead of
 * hiding controls inside the shared component this is its own, smaller one —
 * "one component per record" doesn't mean one component per screen, and
 * folding a manager-only toggle behind a boolean prop on `TeamEventsTab`
 * would leave a dead branch in the manager's own component. À venir/Passés
 * stays: it is real content-scoping a player needs too, not a power-user
 * escape hatch like the table view.
 */
export function TeamAgendaTab({
  clubId,
  teamId,
  isRostered,
  agendaPeriod,
  toggleAgendaPeriod,
  isLoading,
  isError,
  isRefetching,
  refetch,
  isEmpty,
  agendaEvents,
}: {
  clubId: string;
  teamId: string;
  isRostered: boolean;
  agendaPeriod: 'upcoming' | 'past';
  toggleAgendaPeriod: () => void;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => void;
  isEmpty: boolean;
  agendaEvents: TeamEvent[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <SegmentedControl
        ariaLabel="Période"
        value={agendaPeriod}
        onChange={(next) => {
          if (next !== agendaPeriod) toggleAgendaPeriod();
        }}
        options={[
          { value: 'upcoming', label: 'À venir' },
          { value: 'past', label: 'Passés' },
        ]}
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          {isError ? (
            <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
          ) : isLoading ? (
            <SkeletonList rows={3} />
          ) : isEmpty ? (
            <EmptyState
              icon={<CalendarIcon tone="secondary" className="h-8 w-8" />}
              title={agendaPeriod === 'past' ? 'Aucun événement passé' : 'Aucun événement'}
              description={
                agendaPeriod === 'past'
                  ? 'Aucun entraînement ni match n’a encore eu lieu pour cette équipe.'
                  : 'Aucun entraînement ni match n’est encore planifié pour cette équipe.'
              }
            />
          ) : (
            <TeamEventsAgenda
              clubId={clubId}
              teamId={teamId}
              events={agendaEvents}
              isRostered={isRostered}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
