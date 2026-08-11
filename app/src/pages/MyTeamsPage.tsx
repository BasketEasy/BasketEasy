import { useNavigate } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import { Loader } from '@basketeasy/ui/loader';
import { PageContainer } from '@basketeasy/ui/page-container';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';

function MyTeamRow({ team }: { team: MyTeamSummary }) {
  const navigate = useNavigate();

  return (
    <TableRow>
      <TableCell>{team.teamName}</TableCell>
      <TableCell>{team.clubName}</TableCell>
      <TableCell>
        {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
      </TableCell>
      <TableCell className="flex flex-wrap items-center gap-1">
        {team.isTeamAdmin && <Badge>Administrateur</Badge>}
        {team.rosterRole && (
          <Badge variant="secondary">{teamMemberRoleLabel(team.rosterRole)}</Badge>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          onClick={() => navigate(`/clubs/${team.clubId}/teams/${team.teamId}`)}
        >
          Voir
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function MyTeamsPage() {
  const { data: teams, isLoading } = useMyTeamList();

  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        Mes équipes
      </Heading>
      <p className="text-muted">
        Les équipes que vous administrez ou dans lesquelles vous êtes inscrit·e comme joueur ou
        entraîneur.
      </p>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <Loader>Chargement...</Loader>
          ) : teams && teams.length > 0 ? (
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
            <p className="text-muted">Vous n'êtes membre d'aucune équipe pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
