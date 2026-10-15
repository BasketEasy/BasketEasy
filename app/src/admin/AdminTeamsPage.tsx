import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { Gender, TeamCategory } from '@basketeasy/types/teams';
import type { AdminTeamSummary, AdminTeamsQuery } from '@basketeasy/types/platform-admin-browse';
import { TEAM_CATEGORY_OPTIONS, TEAM_GENDER_OPTIONS } from '../clubs/teamLabels';
import { useAdminTeams } from './useAdminQueries';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminFilterBar, AdminSearchFilter, AdminSelectFilter } from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminClubLink, AdminTeamLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';

const FILTER_KEYS = ['q', 'category', 'gender', 'hasAdmin'] as const;

const HAS_ADMIN_OPTIONS = [
  { value: 'true', label: 'Avec gestionnaire' },
  { value: 'false', label: 'Sans gestionnaire' },
] as const;

function ManagerCount({ count }: { count: number }) {
  return (
    <Badge variant="soft" tone={count === 0 ? 'danger' : 'muted'}>
      <span className="tabular">{count}</span>&nbsp;gestionnaire{count > 1 ? 's' : ''}
    </Badge>
  );
}

function TeamRow({ team }: { team: AdminTeamSummary }) {
  const layout = useTableLayout();
  const clubs = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {team.ownerClub ? (
        <AdminClubLink club={team.ownerClub} />
      ) : (
        <Badge variant="soft" tone="danger">
          Sans club propriétaire
        </Badge>
      )}
      {team.partnerClubs.length > 0 && (
        <Badge variant="soft" tone="structure">
          CTC · +{team.partnerClubs.length}
        </Badge>
      )}
    </span>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <AdminTeamLink team={team} />
        {clubs}
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="meta" size="sm" className="tabular">
            {team.rosterCount} dans l’effectif
          </Text>
          <ManagerCount count={team.teamAdminCount} />
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminTeamLink team={team} />
      </TableCell>
      <TableCell>{clubs}</TableCell>
      <TableCell className="tabular">{team.rosterCount}</TableCell>
      <TableCell>
        <ManagerCount count={team.teamAdminCount} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Teams, optionally fixed to one club (a club page's « Équipes » tab). The
 * filters live in the URL under `prefix`, so a tab's filters don't collide
 * with the page's own.
 */
export function AdminTeamsList({ clubId, prefix = '' }: { clubId?: string; prefix?: string }) {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS, prefix);
  const query: AdminTeamsQuery = {
    q: filters.q,
    clubId,
    category: filters.category as TeamCategory | undefined,
    gender: filters.gender as Gender | undefined,
    hasAdmin: filters.hasAdmin as AdminTeamsQuery['hasAdmin'],
    page,
    pageSize,
  };
  const teams = useAdminTeams(query);

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar>
        <AdminSearchFilter
          label="Nom de l’équipe"
          value={filters.q}
          onChange={(q) => setFilters({ q })}
        />
        <AdminSelectFilter
          label="Catégorie"
          allLabel="Toutes"
          options={TEAM_CATEGORY_OPTIONS}
          value={filters.category as TeamCategory | undefined}
          onChange={(category) => setFilters({ category })}
        />
        <AdminSelectFilter
          label="Genre"
          allLabel="Tous"
          options={TEAM_GENDER_OPTIONS}
          value={filters.gender as Gender | undefined}
          onChange={(gender) => setFilters({ gender })}
        />
        <AdminSelectFilter
          label="Gestionnaires"
          allLabel="Toutes"
          options={HAS_ADMIN_OPTIONS}
          value={filters.hasAdmin as 'true' | 'false' | undefined}
          onChange={(hasAdmin) => setFilters({ hasAdmin })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={teams}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucune équipe"
        emptyDescription="Aucune équipe ne correspond à ces filtres."
        loadingLabel="Chargement des équipes…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable columns={['Équipe', 'Clubs', 'Effectif', 'Gestionnaires']}>
              {data.items.map((team) => (
                <TeamRow key={team.id} team={team} />
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

export function AdminTeamsPage() {
  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="Équipes" />
      <AdminTeamsList />
    </div>
  );
}
