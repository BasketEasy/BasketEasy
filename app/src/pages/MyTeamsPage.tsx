import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { SelectField } from '@basketeasy/ui/select-field';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { useIsDesktopViewport } from '../hooks/useIsDesktopViewport';
import { myTeamsQueryKey } from '../clubs/queryKeys';
import { TeamCreateForm } from '../clubs/TeamCreateForm';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';

function MyTeamRow({ team }: { team: MyTeamSummary }) {
  return (
    <TableRow>
      <TableCell>{team.teamName}</TableCell>
      <TableCell>{team.clubName}</TableCell>
      <TableCell>
        {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
      </TableCell>
      <TableCell className="flex flex-wrap items-center gap-1">
        {team.isTeamAdmin && <Badge>Administrateur</Badge>}
        {team.rosterRole && <Badge tone="structure">{teamMemberRoleLabel(team.rosterRole)}</Badge>}
      </TableCell>
      <TableCell>
        <Button asChild variant="outline">
          <Link
            to={`/clubs/${team.clubId}/teams/${team.teamId}`}
            state={{ origin: { from: 'my-teams' } }}
          >
            Voir
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Mobile card row for the My teams table — see MyTeamRow for the desktop equivalent. */
function MyTeamCard({ team }: { team: MyTeamSummary }) {
  return (
    <Card variant="inset" className="flex flex-col gap-2">
      <span className="font-medium text-charcoal">{team.teamName}</span>
      <span className="text-sm text-muted">
        {team.clubName} · {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {team.isTeamAdmin && <Badge>Administrateur</Badge>}
        {team.rosterRole && <Badge tone="structure">{teamMemberRoleLabel(team.rosterRole)}</Badge>}
      </div>
      <Button asChild variant="outline" className="self-start">
        <Link
          to={`/clubs/${team.clubId}/teams/${team.teamId}`}
          state={{ origin: { from: 'my-teams' } }}
        >
          Voir
        </Link>
      </Button>
    </Card>
  );
}

export function MyTeamsPage() {
  const { data: teams, isLoading, isError, refetch, isRefetching } = useMyTeamList();
  const adminClubs = useAdminClubs();
  const isDesktop = useIsDesktopViewport();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | undefined>(undefined);

  const clubId = selectedClubId ?? adminClubs[0]?.id;

  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        Mes équipes
      </Heading>
      <p className="text-muted">
        Les équipes que vous administrez ou dans lesquelles vous êtes inscrit·e comme joueur ou
        entraîneur.
      </p>

      {adminClubs.length > 0 && (
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setSelectedClubId(undefined);
          }}
        >
          <DialogTrigger asChild>
            <Button className="self-start">Créer une équipe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une équipe</DialogTitle>
              <DialogDescription>
                Créez une équipe pour un des clubs que vous administrez, avec sa catégorie d'âge et
                son genre.
              </DialogDescription>
            </DialogHeader>

            {adminClubs.length > 1 && (
              <SelectField
                label="Club"
                id="team-create-club-select"
                options={adminClubs.map((club) => ({ value: club.id, label: club.name }))}
                value={clubId}
                onValueChange={setSelectedClubId}
              />
            )}

            {clubId && (
              <TeamCreateForm
                key={clubId}
                clubId={clubId}
                onSuccess={() => {
                  void queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
                  setIsCreateOpen(false);
                  setSelectedClubId(undefined);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent>
          {isError ? (
            <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
          ) : isLoading ? (
            <SkeletonList rows={3} />
          ) : teams && teams.length > 0 ? (
            isDesktop ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Équipe</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Votre rôle</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((team) => (
                    <MyTeamRow key={team.teamId} team={team} />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col gap-3">
                {teams.map((team) => (
                  <MyTeamCard key={team.teamId} team={team} />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              icon={<TrophyIcon className="h-8 w-8 text-muted" />}
              title="Aucune équipe pour le moment"
              description="Vous n'êtes membre d'aucune équipe pour le moment."
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
