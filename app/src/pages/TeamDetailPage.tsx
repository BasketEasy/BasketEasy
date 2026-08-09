import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import type { TeamCategory, TeamGender } from '@basketeasy/types/teams';
import { useTeamShow } from '../clubs/useTeamShow';
import { useTeamUpdate } from '../clubs/useTeamUpdate';
import { useTeamDelete } from '../clubs/useTeamDelete';
import { useTeamClubList } from '../clubs/useTeamClubList';
import { useTeamPlayerList } from '../clubs/useTeamPlayerList';
import { usePlayerList } from '../clubs/usePlayerList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamClubAddForm } from '../clubs/TeamClubAddForm';
import { TeamClubRow } from '../clubs/TeamClubRow';
import { TeamPlayerAddForm } from '../clubs/TeamPlayerAddForm';
import { TeamPlayerRow } from '../clubs/TeamPlayerRow';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  TEAM_CATEGORY_OPTIONS,
  TEAM_GENDER_OPTIONS,
  teamCategoryLabel,
  teamGenderLabel,
} from '../clubs/teamLabels';

export function TeamDetailPage() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const navigate = useNavigate();
  const isAdmin = useIsClubAdmin(clubId);

  const { data: team, isLoading: isLoadingTeam } = useTeamShow(clubId!, teamId!);
  const { data: teamClubs, isLoading: isLoadingClubs } = useTeamClubList(clubId!, teamId!);
  const { data: teamPlayers, isLoading: isLoadingPlayers } = useTeamPlayerList(clubId!, teamId!);
  const { data: clubPlayers } = usePlayerList(clubId!);

  const { mutate: updateTeam, isPending: isUpdating } = useTeamUpdate(clubId!, teamId!);
  const { mutate: deleteTeam, isPending: isDeleting } = useTeamDelete(clubId!);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TeamCategory>('U9');
  const [gender, setGender] = useState<TeamGender>('MEN');
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAddClubOpen, setIsAddClubOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);

  const isOwner = teamClubs?.find((c) => c.clubId === clubId)?.isOwner ?? false;

  const addablePlayers = useMemo(() => {
    const rosteredPlayerIds = new Set((teamPlayers ?? []).map((tp) => tp.playerId));
    return (clubPlayers ?? []).filter((p) => !rosteredPlayerIds.has(p.id));
  }, [clubPlayers, teamPlayers]);

  const startEditing = () => {
    if (!team) return;
    setName(team.name);
    setCategory(team.category);
    setGender(team.gender);
    setEditError(null);
    setIsEditing(true);
  };

  const handleDelete = () => {
    setDeleteError(null);
    deleteTeam(teamId!, {
      onSuccess: () => navigate(`/clubs/${clubId}/members?tab=teams`),
      onError: (err) => setDeleteError(getClubErrorMessage(err)),
    });
  };

  if (isLoadingTeam || !team) {
    return (
      <PageContainer size="lg">
        <p>Chargement...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="lg">
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => navigate(`/clubs/${clubId}/members?tab=teams`)}
      >
        ← Retour à l'effectif
      </Button>

      {isEditing ? (
        <div className="flex flex-col gap-4">
          {editError && (
            <Alert variant="destructive">
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <FormField
            label="Nom de l'équipe"
            id="team-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <SelectField
            label="Catégorie"
            id="team-edit-category-select"
            options={TEAM_CATEGORY_OPTIONS}
            value={category}
            onValueChange={(value) => setCategory(value as TeamCategory)}
          />

          <SelectField
            label="Genre"
            id="team-edit-gender-select"
            options={TEAM_GENDER_OPTIONS}
            value={gender}
            onValueChange={(value) => setGender(value as TeamGender)}
          />

          <div className="flex gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updateTeam(
                  { name, category, gender },
                  {
                    onSuccess: () => setIsEditing(false),
                    onError: (err) => setEditError(getClubErrorMessage(err)),
                  },
                )
              }
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading as="h1" className="m-0">
              {team.name}
            </Heading>
            <p className="mt-1 text-muted">
              {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={startEditing}>
                Modifier
              </Button>
              {isOwner && (
                <Button variant="outline" disabled={isDeleting} onClick={handleDelete}>
                  Supprimer
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {deleteError && (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Clubs partenaires (CTC)
          </Heading>
          {isAdmin && isOwner && (
            <Dialog open={isAddClubOpen} onOpenChange={setIsAddClubOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Associer un club</Button>
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
                  clubId={clubId!}
                  teamId={teamId!}
                  onSuccess={() => setIsAddClubOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoadingClubs ? (
              <p>Chargement...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Club</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamClubs?.map((link) => (
                    <TeamClubRow
                      key={link.clubId}
                      clubId={clubId!}
                      teamId={teamId!}
                      link={link}
                      canManage={isAdmin && isOwner}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Effectif
          </Heading>
          {isAdmin && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Ajouter un joueur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un joueur à l'effectif</DialogTitle>
                  <DialogDescription>
                    Ajoutez un joueur du club à l'effectif de cette équipe.
                  </DialogDescription>
                </DialogHeader>
                <TeamPlayerAddForm
                  clubId={clubId!}
                  teamId={teamId!}
                  addablePlayers={addablePlayers}
                  onSuccess={() => setIsAddPlayerOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoadingPlayers ? (
              <p>Chargement...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamPlayers?.map((teamPlayer) => (
                    <TeamPlayerRow
                      key={teamPlayer.id}
                      clubId={clubId!}
                      teamId={teamId!}
                      teamPlayer={teamPlayer}
                      isAdmin={isAdmin}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}
