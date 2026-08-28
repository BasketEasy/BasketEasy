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
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import { myTeamsQueryKey } from '../clubs/queryKeys';
import { TeamCreateForm } from '../clubs/TeamCreateForm';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';

/** One row of the My teams table — a table row on desktop, a card below it. */
function MyTeamRow({ team }: { team: MyTeamSummary }) {
  const layout = useTableLayout();

  const badges = (
    <>
      {team.isTeamAdmin && <Badge>Administrateur</Badge>}
      {team.rosterRole && <Badge tone="structure">{teamMemberRoleLabel(team.rosterRole)}</Badge>}
    </>
  );
  const viewLink = (
    <Link
      to={`/clubs/${team.clubId}/teams/${team.teamId}`}
      state={{ origin: { from: 'my-teams' } }}
    >
      Voir
    </Link>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text as="span" variant="label">
          {team.teamName}
        </Text>
        <Text as="span" variant="meta">
          {team.clubName} · {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
        </Text>
        <div className="flex flex-wrap items-center gap-1">{badges}</div>
        <Button asChild variant="outline" className="self-start">
          {viewLink}
        </Button>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>{team.teamName}</TableCell>
      <TableCell>{team.clubName}</TableCell>
      <TableCell>
        {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
      </TableCell>
      <TableCell className="flex flex-wrap items-center gap-1">{badges}</TableCell>
      <TableCell>
        <Button asChild variant="outline">
          {viewLink}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function MyTeamsPage() {
  const { data: teams, isLoading, isError, refetch, isRefetching } = useMyTeamList();
  const adminClubs = useAdminClubs();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | undefined>(undefined);

  const clubId = selectedClubId ?? adminClubs[0]?.id;

  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        Mes équipes
      </Heading>
      <Text variant="meta">
        Les équipes que vous administrez ou dans lesquelles vous êtes inscrit·e comme joueur ou
        entraîneur.
      </Text>

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
            <ResponsiveTable columns={['Équipe', 'Club', 'Catégorie', 'Votre rôle', '']}>
              {teams.map((team) => (
                <MyTeamRow key={team.teamId} team={team} />
              ))}
            </ResponsiveTable>
          ) : (
            <EmptyState
              icon={<TrophyIcon tone="secondary" className="h-8 w-8" />}
              title="Aucune équipe pour le moment"
              description="Vous n'êtes membre d'aucune équipe pour le moment."
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
