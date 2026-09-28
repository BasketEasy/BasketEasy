import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { AdminClubSummary, AdminClubsQuery } from '@basketeasy/types/platform-admin-browse';
import { useAdminClubs } from './useAdminQueries';
import { AdminCreateClubDialog } from './actions/AdminCreateClubDialog';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminFilterBar, AdminSearchFilter, AdminSelectFilter } from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminClubLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { formatAdminDate } from './shared/adminFormat';

const FILTER_KEYS = ['q', 'hasAdmin', 'sort'] as const;

const HAS_ADMIN_OPTIONS = [
  { value: 'true', label: 'Avec admin' },
  { value: 'false', label: 'Sans admin' },
] as const;

const SORT_OPTIONS = [
  { value: 'name', label: 'Nom' },
  { value: 'createdAt', label: 'Création récente' },
] as const;

/** A club with no ADMIN has nobody left who can manage it: flagged, not hidden. */
function AdminCount({ count }: { count: number }) {
  return (
    <Badge variant="soft" tone={count === 0 ? 'danger' : 'muted'}>
      <span className="tabular">{count}</span>&nbsp;admin{count > 1 ? 's' : ''}
    </Badge>
  );
}

function ClubRow({ club }: { club: AdminClubSummary }) {
  const layout = useTableLayout();

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <AdminClubLink club={club} />
        <div className="flex flex-wrap items-center gap-2">
          <AdminCount count={club.adminCount} />
          <Text as="span" variant="meta" size="sm" className="tabular">
            {club.memberCount} membres · {club.teamCount} équipes · {club.playerCount} joueurs
          </Text>
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminClubLink club={club} />
      </TableCell>
      <TableCell className="tabular">{club.ffbbClubCode ?? '—'}</TableCell>
      <TableCell className="tabular">{club.memberCount}</TableCell>
      <TableCell>
        <AdminCount count={club.adminCount} />
      </TableCell>
      <TableCell className="tabular">{club.teamCount}</TableCell>
      <TableCell className="tabular">{club.playerCount}</TableCell>
      <TableCell className="tabular whitespace-nowrap">{formatAdminDate(club.createdAt)}</TableCell>
    </TableRow>
  );
}

export function AdminClubsPage() {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS);
  const query: AdminClubsQuery = {
    q: filters.q,
    hasAdmin: filters.hasAdmin as AdminClubsQuery['hasAdmin'],
    sort: filters.sort as AdminClubsQuery['sort'],
    page,
    pageSize,
  };
  const clubs = useAdminClubs(query);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Clubs"
        subtitle={
          <>
            <span className="tabular">{clubs.data?.total ?? '…'}</span> clubs
          </>
        }
        actions={<AdminCreateClubDialog />}
      />
      <AdminFilterBar>
        <AdminSearchFilter
          label="Nom ou code FFBB"
          value={filters.q}
          onChange={(q) => setFilters({ q })}
        />
        <AdminSelectFilter
          label="Admins"
          allLabel="Tous"
          options={HAS_ADMIN_OPTIONS}
          value={filters.hasAdmin as 'true' | 'false' | undefined}
          onChange={(hasAdmin) => setFilters({ hasAdmin })}
        />
        <AdminSelectFilter
          label="Tri"
          allLabel="Par défaut"
          options={SORT_OPTIONS}
          value={filters.sort as 'name' | 'createdAt' | undefined}
          onChange={(sort) => setFilters({ sort })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={clubs}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucun club"
        emptyDescription="Aucun club ne correspond à ces filtres."
        loadingLabel="Chargement des clubs…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable
              columns={['Club', 'Code FFBB', 'Membres', 'Admins', 'Équipes', 'Joueurs', 'Créé le']}
            >
              {data.items.map((club) => (
                <ClubRow key={club.id} club={club} />
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
