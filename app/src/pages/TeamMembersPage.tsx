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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { useTeamMemberList } from '../teams/useTeamMemberList';
import { useTeamMemberRemove } from '../teams/useTeamMemberRemove';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamMemberAddForm } from '../teams/TeamMemberAddForm';
import { getTeamErrorMessage } from '../teams/teamErrorMessages';

export function TeamMembersPage() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { data: members, isLoading } = useTeamMemberList(clubId!, teamId!);
  const { mutate: removeMember } = useTeamMemberRemove(clubId!, teamId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = (userId: string) => {
    setRemoveError(null);
    removeMember(userId, { onError: (err) => setRemoveError(getTeamErrorMessage(err)) });
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">Membres de l&apos;équipe</h1>

        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>Ajouter un membre</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un membre</DialogTitle>
              </DialogHeader>
              <TeamMemberAddForm
                clubId={clubId!}
                teamId={teamId!}
                onSuccess={() => setIsAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

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
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>{member.email}</TableCell>
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
