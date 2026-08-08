import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { usePlayerList } from '../clubs/usePlayerList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

type RosterTab = 'members' | 'players';

export function RosterPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: RosterTab = searchParams.get('tab') === 'players' ? 'players' : 'members';

  const { data: members, isLoading: isLoadingMembers } = useClubMemberList(clubId!);
  const { data: players, isLoading: isLoadingPlayers } = usePlayerList(clubId!);
  const { mutate: removeMember } = useClubMemberRemove(clubId!);
  const isAdmin = useIsClubAdmin(clubId);

  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);

  const linkedUserIds = useMemo(
    () => new Set((players ?? []).flatMap((p) => (p.userId ? [p.userId] : []))),
    [players],
  );
  const emailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members ?? []) map.set(member.userId, member.email);
    return map;
  }, [members]);
  const linkedPlayerNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of players ?? []) {
      if (player.userId) map.set(player.userId, `${player.firstName} ${player.lastName}`);
    }
    return map;
  }, [players]);

  const handleRemove = (userId: string) => {
    setRemoveError(null);
    removeMember(userId, { onError: (err) => setRemoveError(getClubErrorMessage(err)) });
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Effectif du club</h1>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="members">Membres</TabsTrigger>
          <TabsTrigger value="players">Joueurs</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="flex flex-col gap-6">
          {isAdmin && (
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un membre</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un membre</DialogTitle>
                </DialogHeader>
                <ClubMemberAddForm clubId={clubId!} onSuccess={() => setIsAddMemberOpen(false)} />
              </DialogContent>
            </Dialog>
          )}

          {removeError && (
            <Alert variant="destructive">
              <AlertDescription>{removeError}</AlertDescription>
            </Alert>
          )}

          {isLoadingMembers ? (
            <p>Chargement...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Fiche joueur liée</TableHead>
                  {isAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members?.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role === 'ADMIN' ? 'Administrateur' : 'Membre'}</TableCell>
                    <TableCell>{linkedPlayerNameByUserId.get(member.userId) ?? '—'}</TableCell>
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
        </TabsContent>

        <TabsContent value="players" className="flex flex-col gap-6">
          {isAdmin && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un joueur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un joueur</DialogTitle>
                </DialogHeader>
                <PlayerCreateForm
                  clubId={clubId!}
                  linkableMembers={(members ?? []).filter((m) => !linkedUserIds.has(m.userId))}
                  onSuccess={() => setIsAddPlayerOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}

          {isLoadingPlayers ? (
            <p>Chargement...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prénom</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Compte lié</TableHead>
                  {isAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {players?.map((player) => (
                  <PlayerRow
                    key={player.id}
                    clubId={clubId!}
                    player={player}
                    isAdmin={isAdmin}
                    linkedMemberEmail={
                      player.userId ? (emailByUserId.get(player.userId) ?? null) : null
                    }
                    linkableMembers={(members ?? []).filter(
                      (m) => !linkedUserIds.has(m.userId) || m.userId === player.userId,
                    )}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
