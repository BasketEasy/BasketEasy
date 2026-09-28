import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { EventType } from '@basketeasy/types/events';
import type { AdminEventSummary, AdminEventsQuery } from '@basketeasy/types/platform-admin-browse';
import { useAdminEvents } from './useAdminQueries';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminFilterBar, AdminSelectFilter } from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminLink, AdminTeamLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import {
  SCORESHEET_STATUS_LABELS,
  SCORESHEET_STATUS_TONES,
  formatAdminDateTime,
  eventTitle,
} from './shared/adminFormat';

const FILTER_KEYS = ['type', 'when'] as const;

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'MATCH', label: 'Matchs' },
  { value: 'TRAINING', label: 'Entraînements' },
];

const WHEN_OPTIONS = [
  { value: 'upcoming', label: 'À venir' },
  { value: 'past', label: 'Passés' },
] as const;

function Answers({ event }: { event: AdminEventSummary }) {
  const { going, notGoing, maybe } = event.rsvpCounts;
  return (
    <Text as="span" variant="meta" size="sm" className="tabular">
      {going} présent·es · {notGoing} absent·es · {maybe} peut-être
    </Text>
  );
}

function ScoresheetBadge({ event }: { event: AdminEventSummary }) {
  if (!event.scoresheetStatus) return null;
  return (
    <Badge variant="soft" tone={SCORESHEET_STATUS_TONES[event.scoresheetStatus]}>
      Feuille : {SCORESHEET_STATUS_LABELS[event.scoresheetStatus]}
    </Badge>
  );
}

function EventRow({ event, showTeam }: { event: AdminEventSummary; showTeam: boolean }) {
  const layout = useTableLayout();
  const title = <AdminLink to={adminPaths.event(event.id)}>{eventTitle(event)}</AdminLink>;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text variant="meta" size="sm" className="tabular">
          {formatAdminDateTime(event.startsAt)}
        </Text>
        {title}
        {showTeam && <AdminTeamLink team={event.team} />}
        <Answers event={event} />
        <ScoresheetBadge event={event} />
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell className="tabular whitespace-nowrap">
        {formatAdminDateTime(event.startsAt)}
      </TableCell>
      <TableCell>{title}</TableCell>
      {showTeam && (
        <TableCell>
          <AdminTeamLink team={event.team} />
        </TableCell>
      )}
      <TableCell>
        <Answers event={event} />
      </TableCell>
      <TableCell className="tabular">{event.convocationCount}</TableCell>
      <TableCell>
        <ScoresheetBadge event={event} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Events, optionally fixed to a club or a team, newest first (the API's
 * order). « À venir » / « Passés » split the list at the current minute.
 */
export function AdminEventsList({
  clubId,
  teamId,
  prefix = '',
}: {
  clubId?: string;
  teamId?: string;
  prefix?: string;
}) {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS, prefix);
  // Rounded to the minute so the query key is stable across renders.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const query: AdminEventsQuery = {
    clubId,
    teamId,
    type: filters.type as EventType | undefined,
    from: filters.when === 'upcoming' ? now : undefined,
    to: filters.when === 'past' ? now : undefined,
    page,
    pageSize,
  };
  const events = useAdminEvents(query);
  const showTeam = !teamId;

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar>
        <AdminSelectFilter
          label="Type"
          allLabel="Tous"
          options={TYPE_OPTIONS}
          value={filters.type as EventType | undefined}
          onChange={(type) => setFilters({ type })}
        />
        <AdminSelectFilter
          label="Période"
          allLabel="Toutes"
          options={WHEN_OPTIONS}
          value={filters.when as 'upcoming' | 'past' | undefined}
          onChange={(when) => setFilters({ when })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={events}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucun événement"
        emptyDescription="Aucun événement ne correspond à ces filtres."
        loadingLabel="Chargement des événements…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable
              columns={[
                'Date',
                'Événement',
                ...(showTeam ? ['Équipe'] : []),
                'Réponses',
                'Convocations',
                'Feuille',
              ]}
            >
              {data.items.map((event) => (
                <EventRow key={event.id} event={event} showTeam={showTeam} />
              ))}
            </AdminTable>
            <AdminPagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </AdminQueryBranch>
    </div>
  );
}

export function AdminEventsPage() {
  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="Événements" />
      <AdminEventsList />
    </div>
  );
}
