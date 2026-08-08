import { useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { useAccount } from '../auth/useAccount';
import { usePlayerList } from '../clubs/usePlayerList';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';

export function ClubPlayersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user } = useAccount();
  const { data: players, isLoading } = usePlayerList(clubId!);

  const isAdmin =
    user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Joueurs</h1>

      {isAdmin && <PlayerCreateForm clubId={clubId!} />}

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
