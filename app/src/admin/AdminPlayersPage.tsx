import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type {
  AdminPlayerSummary,
  AdminPlayersQuery,
} from '@basketeasy/types/platform-admin-browse';
import { useAdminPlayers } from './useAdminQueries';
import { usePlatformSession } from './platformSession';
import { useAdminListParams } from './shared/useAdminListParams';
import {
  AdminFilterBar,
  AdminPresets,
  AdminSearchFilter,
  AdminSelectFilter,
} from './shared/AdminFilters';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminClubLink, AdminLink, AdminPersonLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import { CONSENT_STATE_LABELS, CONSENT_STATE_TONES } from './shared/adminFormat';

const FILTER_KEYS = ['q', 'claimed', 'minor', 'missingConsent'] as const;

type Preset = 'all' | 'missingConsent' | 'unclaimed';

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'missingConsent', label: 'Autorisation manquante' },
  { value: 'unclaimed', label: 'Sans compte' },
];

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
] as const;

function presetOf(filters: Partial<Record<string, string>>): Preset {
  if (filters.missingConsent === 'true') return 'missingConsent';
  if (filters.claimed === 'false') return 'unclaimed';
  return 'all';
}

function ConsentBadge({ player }: { player: AdminPlayerSummary }) {
  return (
    <Badge variant="soft" tone={CONSENT_STATE_TONES[player.consentState]}>
      {CONSENT_STATE_LABELS[player.consentState]}
    </Badge>
  );
}

function AccountCell({ player }: { player: AdminPlayerSummary }) {
  return player.linkedUserId ? (
    <AdminLink to={adminPaths.user(player.linkedUserId)}>Compte lié</AdminLink>
  ) : (
    <Text as="span" variant="meta" size="sm">
      Aucun
    </Text>
  );
}

function PlayerRow({ player, showClub }: { player: AdminPlayerSummary; showClub: boolean }) {
  const layout = useTableLayout();

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <AdminPersonLink person={player.person} />
        {showClub && <AdminClubLink club={player.club} />}
        <div className="flex flex-wrap items-center gap-2">
          <ConsentBadge player={player} />
          <AccountCell player={player} />
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminPersonLink person={player.person} />
      </TableCell>
      {showClub && (
        <TableCell>
          <AdminClubLink club={player.club} />
        </TableCell>
      )}
      <TableCell>
        <AccountCell player={player} />
      </TableCell>
      <TableCell>
        <ConsentBadge player={player} />
      </TableCell>
      <TableCell className="tabular">{player.teamCount}</TableCell>
    </TableRow>
  );
}

/** Players, optionally fixed to one club; see AdminTeamsList for `prefix`. */
export function AdminPlayersList({ clubId, prefix = '' }: { clubId?: string; prefix?: string }) {
  const { session } = usePlatformSession();
  const isDataOfficer = session?.role === 'DATA_OFFICER';
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS, prefix);
  const query: AdminPlayersQuery = {
    q: filters.q,
    clubId,
    claimed: filters.claimed as AdminPlayersQuery['claimed'],
    minor: filters.minor as AdminPlayersQuery['minor'],
    missingConsent: filters.missingConsent as AdminPlayersQuery['missingConsent'],
    page,
    pageSize,
  };
  const players = useAdminPlayers(query);
  const showClub = !clubId;

  return (
    <div className="flex flex-col gap-4">
      <AdminPresets
        ariaLabel="Vues rapides"
        value={presetOf(filters)}
        options={PRESET_OPTIONS}
        onChange={(next) =>
          setFilters({
            missingConsent: next === 'missingConsent' ? 'true' : undefined,
            claimed: next === 'unclaimed' ? 'false' : undefined,
          })
        }
      />
      <AdminFilterBar>
        <AdminSearchFilter
          label={isDataOfficer ? 'Nom du joueur' : 'E-mail exact du compte lié'}
          value={filters.q}
          onChange={(q) => setFilters({ q })}
        />
        <AdminSelectFilter
          label="Mineur"
          allLabel="Tous"
          options={BOOLEAN_OPTIONS}
          value={filters.minor as 'true' | 'false' | undefined}
          onChange={(minor) => setFilters({ minor })}
        />
        <AdminSelectFilter
          label="Compte lié"
          allLabel="Tous"
          options={BOOLEAN_OPTIONS}
          value={filters.claimed as 'true' | 'false' | undefined}
          onChange={(claimed) => setFilters({ claimed })}
        />
      </AdminFilterBar>

      <AdminQueryBranch
        query={players}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucun joueur"
        emptyDescription="Aucun joueur ne correspond à ces filtres."
        loadingLabel="Chargement des joueurs…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable
              columns={[
                'Joueur',
                ...(showClub ? ['Club'] : []),
                'Compte',
                'Autorisation',
                'Équipes',
              ]}
            >
              {data.items.map((player) => (
                <PlayerRow key={player.person.id} player={player} showClub={showClub} />
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

export function AdminPlayersPage() {
  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="Joueurs" />
      <AdminPlayersList />
    </div>
  );
}
