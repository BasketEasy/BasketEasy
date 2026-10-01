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
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import type { TeamAdmin, TeamAdminCandidate } from '@basketeasy/types/team-admins';
import { TeamAdminAddForm } from './TeamAdminAddForm';
import { TeamAdminRow } from './TeamAdminRow';

/**
 * The Administrateurs tab body — extracted verbatim from `TeamDetailPage`
 * (no behaviour or visual change), manager-only. See `TeamRosterTab` for why
 * data fetching stays in the page.
 */
export function TeamAdminsTab({
  clubId,
  teamId,
  canManageTeam,
  isAddAdminOpen,
  setIsAddAdminOpen,
  addableAdmins,
  isAdminsError,
  isLoadingAdmins,
  isAdminsRefetching,
  refetchAdmins,
  teamAdmins,
}: {
  clubId: string;
  teamId: string;
  canManageTeam: boolean;
  isAddAdminOpen: boolean;
  setIsAddAdminOpen: (open: boolean) => void;
  addableAdmins: TeamAdminCandidate[];
  isAdminsError: boolean;
  isLoadingAdmins: boolean;
  isAdminsRefetching: boolean;
  refetchAdmins: () => void;
  teamAdmins: TeamAdmin[] | undefined;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogTrigger asChild>
          <Button className="self-start">Ajouter un administrateur</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un administrateur d'équipe</DialogTitle>
            <DialogDescription>
              Donnez à un membre du club la gestion de cette équipe (effectif, événements) sans en
              faire un administrateur du club.
            </DialogDescription>
          </DialogHeader>
          <TeamAdminAddForm
            clubId={clubId}
            teamId={teamId}
            candidates={addableAdmins}
            onSuccess={() => setIsAddAdminOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent>
          {isAdminsError ? (
            <QueryError onRetry={() => refetchAdmins()} isRetrying={isAdminsRefetching} />
          ) : isLoadingAdmins ? (
            <SkeletonList rows={3} />
          ) : (teamAdmins?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<ShieldIcon size="3xl" tone="secondary" />}
              title="Aucun administrateur d'équipe"
              description="Donnez à un membre du club la gestion de cette équipe (effectif, événements)."
              action={
                <Button onClick={() => setIsAddAdminOpen(true)}>Ajouter un administrateur</Button>
              }
            />
          ) : (
            <ResponsiveTable columns={['E-mail', '']}>
              {teamAdmins?.map((admin) => (
                <TeamAdminRow
                  key={admin.userId}
                  clubId={clubId}
                  teamId={teamId}
                  admin={admin}
                  canManage={canManageTeam}
                />
              ))}
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
