import { useParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Button } from '@basketeasy/ui/button';
import { useAccount } from '../auth/useAccount';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';

export function ClubMembersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user } = useAccount();
  const { data: members, isLoading } = useClubMemberList(clubId!);
  const { mutate: removeMember } = useClubMemberRemove(clubId!);

  const isAdmin =
    user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Membres du club</h1>

      {isAdmin && <ClubMemberAddForm clubId={clubId!} />}

      {isLoading ? (
        <p>Chargement...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>{member.email}</TableCell>
                <TableCell>{member.role === 'ADMIN' ? 'Administrateur' : 'Membre'}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button variant="outline" onClick={() => removeMember(member.userId)}>
                      Retirer
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
