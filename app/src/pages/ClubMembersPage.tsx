import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

export function ClubMembersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { data: members, isLoading } = useClubMemberList(clubId!);
  const { mutate: removeMember } = useClubMemberRemove(clubId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = (userId: string) => {
    setRemoveError(null);
    removeMember(userId, { onError: (err) => setRemoveError(getClubErrorMessage(err)) });
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Membres du club</h1>

      {isAdmin && <ClubMemberAddForm clubId={clubId!} />}

      {removeError && (
        <Alert variant="destructive">
          <AlertDescription>{removeError}</AlertDescription>
        </Alert>
      )}

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
                    <Button variant="outline" onClick={() => handleRemove(member.userId)}>
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
