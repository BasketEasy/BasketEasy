import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { ListItem } from '@basketeasy/ui/list';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { PlusIcon } from '@basketeasy/ui/icons/plus';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { QueryError } from '@basketeasy/ui/query-error';
import { SelectField } from '@basketeasy/ui/select-field';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { myTeamsQueryKey } from '../clubs/queryKeys';
import { TeamCreateForm } from '../clubs/TeamCreateForm';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';

/** « Admin · Entraîneur »: every role the reader holds on this team, in one label. */
function teamRoleLabel(team: MyTeamSummary): string {
  return [
    team.isTeamAdmin ? 'Admin' : null,
    team.rosterRole && teamMemberRoleLabel(team.rosterRole),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One team: a table row on desktop, a link row (title, meta, role, chevron) below it. */
function MyTeamRow({ team }: { team: MyTeamSummary }) {
  const layout = useTableLayout();

  const badge = (
    <Badge variant="soft" tone="muted">
      {teamRoleLabel(team)}
    </Badge>
  );
  // A team admin lands on the agenda, same as always. A player with no
  // manage rights here almost always opened this for their stats — send
  // them straight there instead of the extra tap through Agenda first.
  const href = `/clubs/${team.clubId}/teams/${team.teamId}${team.isTeamAdmin ? '' : '?tab=stats'}`;
  const linkState = { origin: { from: 'my-teams' as const } };

  if (layout === 'card') {
    return (
      <ListItem
        asChild
        chevron
        meta={`${team.clubName} · ${teamCategoryLabel(team.category)} ${teamGenderLabel(team.gender)}`}
        trailing={badge}
      >
        <Link to={href} state={linkState}>
          {team.teamName}
        </Link>
      </ListItem>
    );
  }

  return (
    <TableRow>
      <TableCell>{team.teamName}</TableCell>
      <TableCell>{team.clubName}</TableCell>
      <TableCell>
        {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
      </TableCell>
      <TableCell>{badge}</TableCell>
      <TableCell>
        <Button asChild variant="outline">
          <Link to={href} state={linkState}>
            Voir
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** One group of teams under a court-line heading with its count. */
function TeamSection({ title, teams }: { title: string; teams: MyTeamSummary[] }) {
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading as="h2" count={teams.length}>
        {title}
      </SectionHeading>
      <Card variant="flush">
        <ResponsiveTable columns={['Équipe', 'Club', 'Catégorie', 'Votre rôle', '']} list>
          {teams.map((team) => (
            <MyTeamRow key={team.teamId} team={team} />
          ))}
        </ResponsiveTable>
      </Card>
    </section>
  );
}

export function MyTeamsPage() {
  const { data: teams, isLoading, isError, refetch, isRefetching } = useMyTeamList();
  const adminClubs = useAdminClubs();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | undefined>(undefined);

  const clubId = selectedClubId ?? adminClubs[0]?.id;
  // A team the reader is both admin and rostered on appears once, under « Je gère ».
  const managed = teams?.filter((team) => team.isTeamAdmin) ?? [];
  const played = teams?.filter((team) => !team.isTeamAdmin && team.rosterRole !== null) ?? [];

  return (
    <PageContainer size="lg">
      <PageHeader
        title="Mes équipes"
        meta="Celles que vous gérez, entraînez ou dans lesquelles vous jouez."
        actions={
          adminClubs.length > 0 ? (
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open);
                if (!open) setSelectedClubId(undefined);
              }}
            >
              <DialogTrigger asChild>
                <Button size="icon-responsive" aria-label="Créer une équipe">
                  <PlusIcon size="md" />
                  <span className="hidden md:inline">Créer une équipe</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer une équipe</DialogTitle>
                  <DialogDescription>
                    Créez une équipe pour un des clubs que vous administrez, avec sa catégorie d'âge
                    et son genre.
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
          ) : undefined
        }
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
      ) : isLoading ? (
        <SkeletonList rows={3} />
      ) : managed.length > 0 || played.length > 0 ? (
        <>
          {managed.length > 0 && <TeamSection title="Je gère" teams={managed} />}
          {played.length > 0 && <TeamSection title="Je joue ou j’entraîne" teams={played} />}
        </>
      ) : (
        <EmptyState
          icon={<TrophyIcon size="3xl" tone="secondary" />}
          title="Aucune équipe pour le moment"
          description="Vous n'êtes membre d'aucune équipe pour le moment."
        />
      )}
    </PageContainer>
  );
}
