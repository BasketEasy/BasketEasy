import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { usePlayerList } from '../clubs/usePlayerList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';

export function ClubPlayersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { data: players, isLoading } = usePlayerList(clubId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">Joueurs</h1>

        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>Ajouter un joueur</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un joueur</DialogTitle>
              </DialogHeader>
              <PlayerCreateForm clubId={clubId!} onSuccess={() => setIsAddOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
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
            {players?.map((player) => (
              <PlayerRow key={player.id} clubId={clubId!} player={player} isAdmin={isAdmin} />
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
