import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type {
  AdminScoresheetSummary,
  AdminScoresheetsQuery,
} from '@basketeasy/types/platform-admin-browse';
import { useAdminClubs, useAdminScoresheets } from './useAdminQueries';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminFilterBar, AdminPresets, AdminSelectFilter } from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminLink, AdminTeamLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import {
  SCORESHEET_STATUS_LABELS,
  SCORESHEET_STATUS_TONES,
  formatAdminDate,
  formatAdminDateTime,
} from './shared/adminFormat';

const FILTER_KEYS = ['view', 'clubId'] as const;

type View = 'todo' | 'failed' | 'review' | 'stuck' | 'all';

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'todo', label: 'À traiter' },
  { value: 'failed', label: 'Échec' },
  { value: 'review', label: 'À vérifier' },
  { value: 'stuck', label: 'Bloquées' },
  { value: 'all', label: 'Toutes' },
];

/** A sheet still queued or being read an hour after upload is stuck. */
const STUCK_AFTER_MS = 60 * 60 * 1000;

function queryForView(view: View): Pick<AdminScoresheetsQuery, 'status' | 'to'> {
  switch (view) {
    case 'todo':
      return { status: 'FAILED,NEEDS_REVIEW' };
    case 'failed':
      return { status: 'FAILED' };
    case 'review':
      return { status: 'NEEDS_REVIEW' };
    case 'stuck': {
      // Rounded to the minute so the query key is stable across renders.
      const cutoff = Math.floor((Date.now() - STUCK_AFTER_MS) / 60_000) * 60_000;
      return { status: 'QUEUED,PROCESSING', to: new Date(cutoff).toISOString() };
    }
    case 'all':
      return {};
  }
}

function matchLabel(sheet: AdminScoresheetSummary): string {
  return sheet.event.opponentName ? `Match · ${sheet.event.opponentName}` : 'Match';
}

function ScoresheetRow({ sheet }: { sheet: AdminScoresheetSummary }) {
  const layout = useTableLayout();
  const status = (
    <Badge variant="soft" tone={SCORESHEET_STATUS_TONES[sheet.status]}>
      {SCORESHEET_STATUS_LABELS[sheet.status]}
    </Badge>
  );
  const match = (
    <span className="inline-flex flex-col gap-0.5">
      <AdminLink to={adminPaths.event(sheet.event.id)}>{matchLabel(sheet)}</AdminLink>
      <Text as="span" variant="meta" size="sm" className="tabular">
        {formatAdminDate(sheet.event.startsAt)}
      </Text>
    </span>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          {match}
          {status}
        </div>
        <AdminTeamLink team={sheet.team} />
        {sheet.failureReason && (
          <Text variant="meta" size="sm">
            {sheet.failureReason}
          </Text>
        )}
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>{match}</TableCell>
      <TableCell>
        <AdminTeamLink team={sheet.team} />
      </TableCell>
      <TableCell>{status}</TableCell>
      <TableCell className="tabular">{sheet.attemptCount ?? '—'}</TableCell>
      <TableCell>
        <Text variant="meta" size="sm">
          {sheet.failureReason ?? '—'}
        </Text>
      </TableCell>
      <TableCell className="tabular whitespace-nowrap">
        {formatAdminDateTime(sheet.uploadedAt)}
      </TableCell>
    </TableRow>
  );
}

export function AdminScoresheetsPage() {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS);
  const view = (VIEW_OPTIONS.find((option) => option.value === filters.view)?.value ??
    'todo') as View;
  const sheets = useAdminScoresheets({
    ...queryForView(view),
    clubId: filters.clubId,
    page,
    pageSize,
  });
  const clubs = useAdminClubs({ pageSize: 100, sort: 'name' });

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Feuilles de marque"
        subtitle="Lectures en échec, à vérifier, ou bloquées depuis plus d’une heure."
      />
      <AdminPresets
        ariaLabel="Statut"
        value={view}
        options={VIEW_OPTIONS}
        onChange={(next) => setFilters({ view: next === 'todo' ? undefined : next })}
      />
      <AdminFilterBar>
        <AdminSelectFilter
          label="Club"
          allLabel="Tous"
          options={(clubs.data?.items ?? []).map((club) => ({ value: club.id, label: club.name }))}
          value={filters.clubId}
          onChange={(clubId) => setFilters({ clubId })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={sheets}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Rien à traiter"
        emptyDescription="Aucune feuille de marque ne correspond à cette vue."
        loadingLabel="Chargement des feuilles…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable columns={['Match', 'Équipe', 'Statut', 'Tentatives', 'Motif', 'Envoyée']}>
              {data.items.map((sheet) => (
                <ScoresheetRow key={sheet.id} sheet={sheet} />
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
