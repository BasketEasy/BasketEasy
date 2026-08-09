import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Loader } from '@basketeasy/ui/loader';
import { SelectField } from '@basketeasy/ui/select-field';
import type { TeamCategory, TeamGender } from '@basketeasy/types/teams';
import { useTeamShow } from '../clubs/useTeamShow';
import { useTeamUpdate } from '../clubs/useTeamUpdate';
import { useTeamDelete } from '../clubs/useTeamDelete';
import { useTeamClubList } from '../clubs/useTeamClubList';
import { useTeamPlayerList } from '../clubs/useTeamPlayerList';
import { usePlayerList } from '../clubs/usePlayerList';
import { useEventList } from '../clubs/useEventList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamClubAddForm } from '../clubs/TeamClubAddForm';
import { TeamClubRow } from '../clubs/TeamClubRow';
import { TeamPlayerAddForm } from '../clubs/TeamPlayerAddForm';
import { TeamPlayerRow } from '../clubs/TeamPlayerRow';
import { EventCreateForm } from '../clubs/EventCreateForm';
import { EventRow } from '../clubs/EventRow';
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
  const { data: events, isLoading: isLoadingEvents } = useEventList(clubId!, teamId!);

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
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);

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
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <Loader>Chargement...</Loader>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
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
            <h1 className="m-0 text-4xl">{team.name}</h1>
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
          <h2 className="m-0 text-2xl">Clubs partenaires (CTC)</h2>
          {isAdmin && isOwner && (
            <Dialog open={isAddClubOpen} onOpenChange={setIsAddClubOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Associer un club</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Associer un club partenaire</DialogTitle>
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

        {isLoadingClubs ? (
          <Loader>Chargement...</Loader>
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 text-2xl">Effectif</h2>
          {isAdmin && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Ajouter un joueur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un joueur à l'effectif</DialogTitle>
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

        {isLoadingPlayers ? (
          <Loader>Chargement...</Loader>
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 text-2xl">Événements</h2>
          {isAdmin && (
            <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Créer un événement</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer un événement</DialogTitle>
                </DialogHeader>
                <EventCreateForm
                  clubId={clubId!}
                  teamId={teamId!}
                  onSuccess={() => setIsAddEventOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoadingEvents ? (
          <Loader>Chargement...</Loader>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lieu</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events?.map((event) => (
                <EventRow
                  key={event.id}
                  clubId={clubId!}
                  teamId={teamId!}
                  event={event}
                  isAdmin={isAdmin}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
