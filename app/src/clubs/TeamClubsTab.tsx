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
import { SelectField } from '@basketeasy/ui/select-field';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import type { TeamClubLink } from '@basketeasy/types/teams';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { TeamClubAddForm } from './TeamClubAddForm';
import { TeamClubRow } from './TeamClubRow';
import { TEAM_CLUB_SORT_OPTIONS } from './teamFilterOptions';

/**
 * The Clubs partenaires tab body — extracted verbatim from `TeamDetailPage`
 * (no behaviour or visual change), manager-only. See `TeamRosterTab` for why
 * data fetching stays in the page.
 */
export function TeamClubsTab({
  clubId,
  teamId,
  isAdmin,
  isOwner,
  isAddClubOpen,
  setIsAddClubOpen,
  teamClubsSearch,
  setTeamClubsSearch,
  teamClubsSort,
  setTeamClubsSort,
  setTeamClubsPage,
  teamClubsPageSize,
  setTeamClubsPageSize,
  isTeamClubsFiltered,
  isClubsError,
  isLoadingClubs,
  isClubsRefetching,
  refetchClubs,
  teamClubs,
  teamClubsResult,
  pageSizeOptions,
}: {
  clubId: string;
  teamId: string;
  isAdmin: boolean;
  isOwner: boolean;
  isAddClubOpen: boolean;
  setIsAddClubOpen: (open: boolean) => void;
  teamClubsSearch: string;
  setTeamClubsSearch: (value: string) => void;
  teamClubsSort: string;
  setTeamClubsSort: (value: string) => void;
  setTeamClubsPage: (page: number) => void;
  teamClubsPageSize: number;
  setTeamClubsPageSize: (size: number) => void;
  isTeamClubsFiltered: boolean;
  isClubsError: boolean;
  isLoadingClubs: boolean;
  isClubsRefetching: boolean;
  refetchClubs: () => void;
  teamClubs: TeamClubLink[] | undefined;
  teamClubsResult: PaginatedResult<TeamClubLink> | undefined;
  pageSizeOptions: number[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {isAdmin && isOwner && (
        <Dialog open={isAddClubOpen} onOpenChange={setIsAddClubOpen}>
          <DialogTrigger asChild>
            <Button className="self-start">Associer un club</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Associer un club partenaire</DialogTitle>
              <DialogDescription>
                Ajoutez un club partenaire à cette équipe CTC pour partager son effectif et son
                encadrement.
              </DialogDescription>
            </DialogHeader>
            <TeamClubAddForm
              clubId={clubId}
              teamId={teamId}
              onSuccess={() => setIsAddClubOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Input
          aria-label="Rechercher un club partenaire"
          placeholder="Rechercher un club…"
          value={teamClubsSearch}
          onChange={(e) => {
            setTeamClubsSearch(e.target.value);
            setTeamClubsPage(1);
          }}
          className="max-w-xs"
        />
        <SelectField
          label="Trier par"
          containerClassName="w-56"
          value={teamClubsSort}
          onValueChange={(value) => {
            setTeamClubsSort(value);
            setTeamClubsPage(1);
          }}
          options={TEAM_CLUB_SORT_OPTIONS}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {isClubsError ? (
            <QueryError onRetry={() => refetchClubs()} isRetrying={isClubsRefetching} />
          ) : isLoadingClubs ? (
            <SkeletonList rows={3} />
          ) : (teamClubsResult?.total ?? 0) === 0 ? (
            <EmptyState
              icon={<BuildingIcon size="3xl" tone="secondary" />}
              title={isTeamClubsFiltered ? 'Aucun résultat' : 'Aucun club partenaire'}
              description={
                isTeamClubsFiltered
                  ? 'Aucun club partenaire ne correspond à votre recherche.'
                  : 'Associez un club partenaire pour gérer une équipe CTC à effectif partagé.'
              }
              action={
                isAdmin && isOwner && !isTeamClubsFiltered ? (
                  <Button onClick={() => setIsAddClubOpen(true)}>Associer un club</Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ResponsiveTable columns={['Club', '']}>
                {teamClubs?.map((link) => (
                  <TeamClubRow
                    key={link.clubId}
                    clubId={clubId}
                    teamId={teamId}
                    link={link}
                    canManage={isAdmin && isOwner}
                  />
                ))}
              </ResponsiveTable>
              <Pagination
                page={teamClubsResult?.page ?? 1}
                pageSize={teamClubsResult?.pageSize ?? teamClubsPageSize}
                total={teamClubsResult?.total ?? 0}
                onPageChange={setTeamClubsPage}
                pageSizeOptions={pageSizeOptions}
                onPageSizeChange={(size) => {
                  setTeamClubsPageSize(size);
                  setTeamClubsPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
