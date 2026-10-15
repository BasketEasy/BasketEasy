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
import { Input } from '@basketeasy/ui/input';
import { Pagination } from '@basketeasy/ui/pagination';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { SelectField } from '@basketeasy/ui/select-field';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { Gender, TeamPlayer } from '@basketeasy/types/teams';
import type { Player } from '@basketeasy/types/players';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { TeamPlayerAddForm } from './TeamPlayerAddForm';
import { TeamPlayerRow } from './TeamPlayerRow';
import { TeamRosterCards } from './TeamRosterCards';
import { ROSTER_SORT_OPTIONS } from './teamFilterOptions';

/**
 * The Effectif tab body — extracted verbatim from `TeamDetailPage` (no
 * behaviour or visual change) so the page's role split doesn't have to be
 * reviewed in the same diff as a 1000-line rewrite. All data fetching and
 * filter state still live in `TeamDetailPage`; this component is purely
 * presentational.
 */
export function TeamRosterTab({
  clubId,
  teamId,
  teamGender,
  canManageTeam,
  canAddPlayers,
  addablePlayers,
  isLoadingAddablePlayers,
  isAddablePlayersError,
  isAddablePlayersRefetching,
  refetchAddablePlayers,
  isAddPlayerOpen,
  setIsAddPlayerOpen,
  rosterViewMode,
  toggleRosterViewMode,
  rosterSearch,
  setRosterSearch,
  rosterSort,
  setRosterSort,
  setRosterPage,
  rosterPageSize,
  setRosterPageSize,
  isRosterFiltered,
  isRosterError,
  isLoadingRoster,
  isRosterRefetching,
  refetchRoster,
  isRosterEmpty,
  allTeamPlayers,
  teamPlayers,
  teamPlayersResult,
  pageSizeOptions,
}: {
  clubId: string;
  teamId: string;
  teamGender: Gender;
  canManageTeam: boolean;
  /**
   * The picker lists the club's players, which only a club admin can read: a team
   * manager who isn't one gets a hint instead of a button that opens an empty list.
   */
  canAddPlayers: boolean;
  addablePlayers: Player[];
  /** The club's players load when the dialog opens, so the picker has its own states. */
  isLoadingAddablePlayers: boolean;
  isAddablePlayersError: boolean;
  isAddablePlayersRefetching: boolean;
  refetchAddablePlayers: () => void;
  isAddPlayerOpen: boolean;
  setIsAddPlayerOpen: (open: boolean) => void;
  rosterViewMode: 'cards' | 'table';
  toggleRosterViewMode: () => void;
  rosterSearch: string;
  setRosterSearch: (value: string) => void;
  rosterSort: string;
  setRosterSort: (value: string) => void;
  setRosterPage: (page: number) => void;
  rosterPageSize: number;
  setRosterPageSize: (size: number) => void;
  isRosterFiltered: boolean;
  isRosterError: boolean;
  isLoadingRoster: boolean;
  isRosterRefetching: boolean;
  refetchRoster: () => void;
  isRosterEmpty: boolean;
  allTeamPlayers: TeamPlayer[];
  teamPlayers: TeamPlayer[] | undefined;
  teamPlayersResult: PaginatedResult<TeamPlayer> | undefined;
  pageSizeOptions: number[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {canManageTeam && !canAddPlayers && (
          <Text variant="meta">Pour ajouter un joueur, demandez à un administrateur du club.</Text>
        )}
        {canAddPlayers && (
          <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
            <DialogTrigger asChild>
              <Button className="self-start">Ajouter un joueur</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un joueur à l'effectif</DialogTitle>
                <DialogDescription>
                  Ajoutez un joueur du club à l'effectif de cette équipe.
                </DialogDescription>
              </DialogHeader>
              {isAddablePlayersError ? (
                <QueryError
                  onRetry={() => refetchAddablePlayers()}
                  isRetrying={isAddablePlayersRefetching}
                />
              ) : isLoadingAddablePlayers ? (
                <SkeletonList rows={2} />
              ) : (
                <TeamPlayerAddForm
                  clubId={clubId}
                  teamId={teamId}
                  addablePlayers={addablePlayers}
                  onSuccess={() => setIsAddPlayerOpen(false)}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
        <SegmentedControl
          ariaLabel="Affichage de l'effectif"
          value={rosterViewMode}
          onChange={(next) => {
            if (next !== rosterViewMode) toggleRosterViewMode();
          }}
          options={[
            { value: 'cards', label: 'Cartes' },
            { value: 'table', label: 'Tableau' },
          ]}
        />
      </div>

      {rosterViewMode === 'table' && (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            aria-label="Rechercher un joueur de l'effectif"
            placeholder="Rechercher un joueur…"
            value={rosterSearch}
            onChange={(e) => {
              setRosterSearch(e.target.value);
              setRosterPage(1);
            }}
            className="max-w-xs"
          />
          <SelectField
            label="Trier par"
            containerClassName="w-56"
            value={rosterSort}
            onValueChange={(value) => {
              setRosterSort(value);
              setRosterPage(1);
            }}
            options={ROSTER_SORT_OPTIONS}
          />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          {isRosterError ? (
            <QueryError onRetry={() => refetchRoster()} isRetrying={isRosterRefetching} />
          ) : isLoadingRoster ? (
            <SkeletonList rows={3} />
          ) : isRosterEmpty ? (
            <EmptyState
              icon={<UsersIcon size="3xl" tone="secondary" />}
              title={isRosterFiltered ? 'Aucun résultat' : 'Effectif vide'}
              description={
                isRosterFiltered
                  ? "Aucun joueur de l'effectif ne correspond à votre recherche."
                  : canManageTeam && !canAddPlayers
                    ? "Un administrateur du club peut ajouter des joueurs à l'effectif de cette équipe."
                    : "Ajoutez un joueur du club à l'effectif de cette équipe."
              }
              action={
                canAddPlayers && !isRosterFiltered ? (
                  <Button onClick={() => setIsAddPlayerOpen(true)}>Ajouter un joueur</Button>
                ) : undefined
              }
            />
          ) : rosterViewMode === 'cards' ? (
            <TeamRosterCards players={allTeamPlayers} teamGender={teamGender} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamPlayers?.map((teamPlayer) => (
                    <TeamPlayerRow
                      key={teamPlayer.id}
                      clubId={clubId}
                      teamId={teamId}
                      teamPlayer={teamPlayer}
                      canManage={canManageTeam}
                    />
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={teamPlayersResult?.page ?? 1}
                pageSize={teamPlayersResult?.pageSize ?? rosterPageSize}
                total={teamPlayersResult?.total ?? 0}
                onPageChange={setRosterPage}
                pageSizeOptions={pageSizeOptions}
                onPageSizeChange={(size) => {
                  setRosterPageSize(size);
                  setRosterPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
