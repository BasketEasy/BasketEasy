import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { ClubRole } from '@basketeasy/types/club-members';
import type { AdminUserSummary, AdminUsersQuery } from '@basketeasy/types/platform-admin-browse';
import { useAdminClubs, useAdminTeams, useAdminUsers } from './useAdminQueries';
import { usePlatformSession } from './platformSession';
import { useAdminListParams } from './shared/useAdminListParams';
import {
  AdminFilterBar,
  AdminPresets,
  AdminSearchFilter,
  AdminSelectFilter,
} from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminPersonLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { CLUB_ROLE_LABELS, formatAdminDate, teamLabel } from './shared/adminFormat';

const FILTER_KEYS = [
  'q',
  'clubId',
  'teamId',
  'clubRole',
  'verified',
  'inactiveSoon',
  'isGuardian',
  'hasPlatformRole',
  'sort',
] as const;

type Preset = 'all' | 'inactive' | 'unverified' | 'guardians' | 'staff';

/** Each preset is a set of filters; choosing one replaces the others it owns. */
const PRESET_FILTERS: Record<Preset, Partial<Record<(typeof FILTER_KEYS)[number], string>>> = {
  all: {},
  inactive: { inactiveSoon: 'true' },
  unverified: { verified: 'false' },
  guardians: { isGuardian: 'true' },
  staff: { hasPlatformRole: 'true' },
};

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'inactive', label: 'Bientôt effacés' },
  { value: 'unverified', label: 'Non vérifiés' },
  { value: 'guardians', label: 'Parents' },
  { value: 'staff', label: 'Staff Kluvo' },
];

const SORT_OPTIONS = [
  { value: 'lastActiveAt', label: 'Dernière activité' },
  { value: 'createdAt', label: 'Inscription récente' },
] as const;

const ROLE_OPTIONS = (Object.keys(CLUB_ROLE_LABELS) as ClubRole[]).map((role) => ({
  value: role,
  label: CLUB_ROLE_LABELS[role],
}));

/** Pickers list at most one API page; beyond that, search by name instead. */
const PICKER_PAGE_SIZE = 100;

function presetOf(filters: Partial<Record<string, string>>): Preset {
  if (filters.inactiveSoon === 'true') return 'inactive';
  if (filters.verified === 'false') return 'unverified';
  if (filters.isGuardian === 'true') return 'guardians';
  if (filters.hasPlatformRole === 'true') return 'staff';
  return 'all';
}

function ErasureBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <Badge variant="soft" tone="danger">
        Dépassée
      </Badge>
    );
  }
  return (
    <Badge variant="soft" tone={days <= 31 ? 'danger' : 'muted'}>
      <span className="tabular">{days}</span>&nbsp;j
    </Badge>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <Badge variant="soft" tone={verified ? 'success' : 'muted'}>
      {verified ? 'Vérifiée' : 'Non vérifiée'}
    </Badge>
  );
}

function PlatformRoleBadge({ role }: { role: AdminUserSummary['platformRole'] }) {
  if (!role)
    return (
      <Text as="span" variant="meta" size="sm">
        —
      </Text>
    );
  return (
    <Badge variant="soft" tone="brand">
      {role === 'DATA_OFFICER' ? 'DPO' : 'Support'}
    </Badge>
  );
}

function UserRow({ user }: { user: AdminUserSummary }) {
  const layout = useTableLayout();

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <AdminPersonLink person={user.person} withContact />
          <ErasureBadge days={user.daysUntilErasure} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerifiedBadge verified={user.emailVerified} />
          <Badge variant="soft" tone="structure">
            <span className="tabular">{user.clubCount}</span>&nbsp;club(s)
          </Badge>
          {user.guardianOfCount > 0 && (
            <Badge variant="soft" tone="structure">
              Parent
            </Badge>
          )}
          {user.platformRole && <PlatformRoleBadge role={user.platformRole} />}
        </div>
        <Text variant="meta" size="sm" className="tabular">
          Dernière activité : {formatAdminDate(user.lastActiveAt)}
        </Text>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminPersonLink person={user.person} withContact />
      </TableCell>
      <TableCell>
        <VerifiedBadge verified={user.emailVerified} />
      </TableCell>
      <TableCell className="tabular">{user.clubCount}</TableCell>
      <TableCell className="tabular">{user.guardianOfCount}</TableCell>
      <TableCell className="tabular whitespace-nowrap">
        {formatAdminDate(user.lastActiveAt)}
      </TableCell>
      <TableCell>
        <ErasureBadge days={user.daysUntilErasure} />
      </TableCell>
      <TableCell>
        <PlatformRoleBadge role={user.platformRole} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Every account on the platform, filterable by club, team, role and state.
 * What each row shows of the person is decided by the server for this
 * admin's role; opening one is the audited moment for a DATA_OFFICER.
 */
export function AdminUsersPage() {
  const { session } = usePlatformSession();
  const isDataOfficer = session?.role === 'DATA_OFFICER';
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS);
  const preset = presetOf(filters);

  const query: AdminUsersQuery = {
    ...filters,
    clubRole: filters.clubRole as ClubRole | undefined,
    verified: filters.verified as AdminUsersQuery['verified'],
    inactiveSoon: filters.inactiveSoon as AdminUsersQuery['inactiveSoon'],
    isGuardian: filters.isGuardian as AdminUsersQuery['isGuardian'],
    hasPlatformRole: filters.hasPlatformRole as AdminUsersQuery['hasPlatformRole'],
    sort: filters.sort as AdminUsersQuery['sort'],
    page,
    pageSize,
  };
  const users = useAdminUsers(query);
  const clubs = useAdminClubs({ pageSize: PICKER_PAGE_SIZE, sort: 'name' });
  const teams = useAdminTeams({ clubId: filters.clubId, pageSize: PICKER_PAGE_SIZE });

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Utilisateurs"
        subtitle={
          <>
            <span className="tabular">{users.data?.total ?? '…'}</span> comptes
            {isDataOfficer && ' · ouvrir une fiche est une consultation journalisée'}
          </>
        }
      />

      <AdminPresets
        ariaLabel="Vues rapides"
        value={preset}
        options={PRESET_OPTIONS}
        onChange={(next) =>
          setFilters({
            inactiveSoon: undefined,
            verified: undefined,
            isGuardian: undefined,
            hasPlatformRole: undefined,
            ...PRESET_FILTERS[next],
          })
        }
      />

      <AdminFilterBar>
        <AdminSearchFilter
          label={isDataOfficer ? 'Recherche' : 'Adresse e-mail exacte'}
          placeholder={isDataOfficer ? 'Nom, prénom ou e-mail' : 'prenom.nom@exemple.fr'}
          hint={
            isDataOfficer
              ? undefined
              : 'Profil support : les noms sont masqués et la recherche attend une adresse complète.'
          }
          value={filters.q}
          onChange={(q) => setFilters({ q })}
        />
        <AdminSelectFilter
          label="Club"
          allLabel="Tous"
          options={(clubs.data?.items ?? []).map((club) => ({ value: club.id, label: club.name }))}
          value={filters.clubId}
          onChange={(clubId) => setFilters({ clubId, teamId: undefined })}
        />
        <AdminSelectFilter
          label="Équipe"
          allLabel="Toutes"
          options={(teams.data?.items ?? []).map((team) => ({
            value: team.id,
            label: teamLabel(team),
          }))}
          value={filters.teamId}
          onChange={(teamId) => setFilters({ teamId })}
        />
        <AdminSelectFilter
          label="Rôle club"
          allLabel="Tous"
          options={ROLE_OPTIONS}
          value={filters.clubRole as ClubRole | undefined}
          onChange={(clubRole) => setFilters({ clubRole })}
        />
        <AdminSelectFilter
          label="Tri"
          allLabel="Par défaut"
          options={SORT_OPTIONS}
          value={filters.sort as (typeof SORT_OPTIONS)[number]['value'] | undefined}
          onChange={(sort) => setFilters({ sort })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={users}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucun compte"
        emptyDescription="Aucun compte ne correspond à ces filtres."
        loadingLabel="Chargement des comptes…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable
              columns={[
                'Personne',
                'Adresse',
                'Clubs',
                'Parent de',
                'Dernière activité',
                'Effacement',
                'Plateforme',
              ]}
            >
              {data.items.map((user) => (
                <UserRow key={user.person.id} user={user} />
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
