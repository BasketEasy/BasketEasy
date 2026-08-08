import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { useTeamList } from '../teams/useTeamList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamCreateForm } from '../teams/TeamCreateForm';

export function ClubTeamsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { data: teams, isLoading } = useTeamList(clubId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">Équipes</h1>

        {isAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>Créer une équipe</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une équipe</DialogTitle>
              </DialogHeader>
              <TeamCreateForm clubId={clubId!} onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p>Chargement...</p>
      ) : teams && teams.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                to={`/clubs/${clubId}/teams/${team.id}/members`}
                className="text-blue-green underline"
              >
                {team.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Aucune équipe pour le moment.</p>
      )}
    </main>
  );
}
