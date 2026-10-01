import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { FormField } from '@basketeasy/ui/form-field';
import { Input } from '@basketeasy/ui/input';
import { Pagination } from '@basketeasy/ui/pagination';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { SelectField } from '@basketeasy/ui/select-field';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import type { TeamEvent } from '@basketeasy/types/events';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import { ActionItemsBand } from './ActionItemsBand';
import { EventCreateForm } from './EventCreateForm';
import { EventRow } from './EventRow';
import { TeamEventsAgenda } from './TeamEventsAgenda';
import { EVENT_SORT_OPTIONS } from './teamFilterOptions';

/**
 * The Événements tab body — extracted verbatim from `TeamDetailPage` (no
 * behaviour or visual change, aside from phase 9's `actionItems` band). See
 * `TeamRosterTab` for why data fetching stays in the page.
 *
 * `teamActionItems` is `TeamDetailPage`'s `GET /me/dashboard` fetch, already
 * filtered down to this team's own items (`item.teamId === teamId`) — the
 * manager's team-scoped « à traiter », matching `admin-team.html`'s mockup
 * placement between the period toggle and the event list.
 */
export function TeamEventsTab({
  clubId,
  teamId,
  canManageTeam,
  isRostered,
  teamActionItems,
  isAddEventOpen,
  setIsAddEventOpen,
  eventsViewMode,
  toggleEventsViewMode,
  agendaPeriod,
  toggleAgendaPeriod,
  eventsSearch,
  setEventsSearch,
  eventsFrom,
  setEventsFrom,
  eventsTo,
  setEventsTo,
  eventsSortOrder,
  setEventsSortOrder,
  setEventsPage,
  eventsPageSize,
  setEventsPageSize,
  isEventsFiltered,
  isEventsViewError,
  isLoadingEventsView,
  isEventsViewRefetching,
  refetchEventsView,
  isEventsEmpty,
  agendaEvents,
  events,
  eventsResult,
  pageSizeOptions,
}: {
  clubId: string;
  teamId: string;
  canManageTeam: boolean;
  isRostered: boolean;
  teamActionItems: ActionItem[];
  isAddEventOpen: boolean;
  setIsAddEventOpen: (open: boolean) => void;
  eventsViewMode: 'agenda' | 'table';
  toggleEventsViewMode: () => void;
  agendaPeriod: 'upcoming' | 'past';
  toggleAgendaPeriod: () => void;
  eventsSearch: string;
  setEventsSearch: (value: string) => void;
  eventsFrom: string;
  setEventsFrom: (value: string) => void;
  eventsTo: string;
  setEventsTo: (value: string) => void;
  eventsSortOrder: SortOrder;
  setEventsSortOrder: (value: SortOrder) => void;
  setEventsPage: (page: number) => void;
  eventsPageSize: number;
  setEventsPageSize: (size: number) => void;
  isEventsFiltered: boolean;
  isEventsViewError: boolean;
  isLoadingEventsView: boolean;
  isEventsViewRefetching: boolean;
  refetchEventsView: () => void;
  isEventsEmpty: boolean;
  agendaEvents: TeamEvent[];
  events: TeamEvent[] | undefined;
  eventsResult: PaginatedResult<TeamEvent> | undefined;
  pageSizeOptions: number[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {canManageTeam && (
          <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
            <DialogTrigger asChild>
              <Button className="self-start">Créer un événement</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un événement</DialogTitle>
                <DialogDescription>
                  Planifiez un entraînement ou un rendez-vous pour cette équipe.
                </DialogDescription>
              </DialogHeader>
              <EventCreateForm
                clubId={clubId}
                teamId={teamId}
                onSuccess={() => setIsAddEventOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        <SegmentedControl
          ariaLabel="Affichage des événements"
          value={eventsViewMode}
          onChange={(next) => {
            if (next !== eventsViewMode) toggleEventsViewMode();
          }}
          options={[
            { value: 'agenda', label: 'Agenda' },
            { value: 'table', label: 'Liste' },
          ]}
        />
      </div>

      {eventsViewMode === 'agenda' && (
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
      )}

      {eventsViewMode === 'table' && (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            aria-label="Rechercher un événement"
            placeholder="Rechercher (lieu, notes)…"
            value={eventsSearch}
            onChange={(e) => {
              setEventsSearch(e.target.value);
              setEventsPage(1);
            }}
            className="max-w-xs"
          />
          <FormField
            label="Du"
            type="date"
            value={eventsFrom}
            onChange={(e) => {
              setEventsFrom(e.target.value);
              setEventsPage(1);
            }}
          />
          <FormField
            label="Au"
            type="date"
            value={eventsTo}
            onChange={(e) => {
              setEventsTo(e.target.value);
              setEventsPage(1);
            }}
          />
          <SelectField
            label="Trier par"
            containerClassName="w-56"
            value={eventsSortOrder}
            onValueChange={(value) => {
              setEventsSortOrder(value as SortOrder);
              setEventsPage(1);
            }}
            options={EVENT_SORT_OPTIONS}
          />
        </div>
      )}

      <ActionItemsBand items={teamActionItems} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          {isEventsViewError ? (
            <QueryError onRetry={() => refetchEventsView()} isRetrying={isEventsViewRefetching} />
          ) : isLoadingEventsView ? (
            <SkeletonList rows={3} />
          ) : isEventsEmpty ? (
            <EmptyState
              icon={<CalendarIcon size="3xl" tone="secondary" />}
              title={
                eventsViewMode === 'table' && isEventsFiltered
                  ? 'Aucun résultat'
                  : eventsViewMode === 'agenda' && agendaPeriod === 'past'
                    ? 'Aucun événement passé'
                    : 'Aucun événement'
              }
              description={
                eventsViewMode === 'table' && isEventsFiltered
                  ? 'Aucun événement ne correspond à ces critères.'
                  : eventsViewMode === 'agenda' && agendaPeriod === 'past'
                    ? 'Aucun entraînement ni match n’a encore eu lieu pour cette équipe.'
                    : 'Planifiez un entraînement ou un match pour cette équipe.'
              }
              action={
                canManageTeam &&
                !(eventsViewMode === 'table' && isEventsFiltered) &&
                !(eventsViewMode === 'agenda' && agendaPeriod === 'past') ? (
                  <Button onClick={() => setIsAddEventOpen(true)}>Créer un événement</Button>
                ) : undefined
              }
            />
          ) : eventsViewMode === 'agenda' ? (
            <TeamEventsAgenda
              clubId={clubId}
              teamId={teamId}
              events={agendaEvents}
              isRostered={isRostered}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lieu</TableHead>
                    <TableHead>Adversaire</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Réponse</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.map((event) => (
                    <EventRow
                      key={event.id}
                      clubId={clubId}
                      teamId={teamId}
                      event={event}
                      canManage={canManageTeam}
                      isRostered={isRostered}
                    />
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={eventsResult?.page ?? 1}
                pageSize={eventsResult?.pageSize ?? eventsPageSize}
                total={eventsResult?.total ?? 0}
                onPageChange={setEventsPage}
                pageSizeOptions={pageSizeOptions}
                onPageSizeChange={(size) => {
                  setEventsPageSize(size);
                  setEventsPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
