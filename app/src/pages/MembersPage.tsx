import { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
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
import { Card, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { Loader } from '@basketeasy/ui/loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import type { ClubMember } from '@basketeasy/types/club-members';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { usePlayerList } from '../clubs/usePlayerList';
import { useTeamList } from '../clubs/useTeamList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';
import { TeamCreateForm } from '../clubs/TeamCreateForm';
import { TeamRow } from '../clubs/TeamRow';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

type MembersTab = 'members' | 'players' | 'teams';

function MemberRow({
  member,
  isAdmin,
  linkedPlayerName,
  onRemove,
}: {
  member: ClubMember;
  isAdmin: boolean;
  linkedPlayerName: string | null;
  onRemove: (userId: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <TableRow>
      <TableCell>{member.email}</TableCell>
      <TableCell>{member.role === 'ADMIN' ? 'Administrateur' : 'Membre'}</TableCell>
      <TableCell>{linkedPlayerName ?? '—'}</TableCell>
      {isAdmin && (
        <TableCell>
          {isConfirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                Fiche joueur liée : {linkedPlayerName}. Elle sera conservée, seul le lien avec ce
                compte sera supprimé.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfirming(false);
                    onRemove(member.userId);
                  }}
                >
                  Confirmer
                </Button>
                <Button variant="ghost" onClick={() => setIsConfirming(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => (linkedPlayerName ? setIsConfirming(true) : onRemove(member.userId))}
            >
              Retirer
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export function MembersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: MembersTab =
    tabParam === 'players' ? 'players' : tabParam === 'teams' ? 'teams' : 'members';

  const isAdmin = useIsClubAdmin(clubId);

  const { data: members, isLoading: isLoadingMembers } = useClubMemberList(clubId!, {
    enabled: isAdmin,
  });
  const { data: players, isLoading: isLoadingPlayers } = usePlayerList(clubId!, {
    enabled: isAdmin,
  });
  const { data: teams, isLoading: isLoadingTeams } = useTeamList(clubId!, { enabled: isAdmin });
  const { mutate: removeMember } = useClubMemberRemove(clubId!);

  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddTeamOpen, setIsAddTeamOpen] = useState(false);
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

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        Effectif du club
      </Heading>

      {removeError && (
        <Alert variant="destructive">
          <AlertDescription>{removeError}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="members">Membres</TabsTrigger>
          <TabsTrigger value="players">Joueurs</TabsTrigger>
          <TabsTrigger value="teams">Équipes</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4 flex flex-col gap-4">
          {isAdmin && (
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un membre</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un membre</DialogTitle>
                  <DialogDescription>
                    Invitez une personne ayant déjà un compte BasketEasy à rejoindre le club.
                  </DialogDescription>
                </DialogHeader>
                <ClubMemberAddForm clubId={clubId!} onSuccess={() => setIsAddMemberOpen(false)} />
              </DialogContent>
            </Dialog>
          )}

          <Card>
            <CardContent className="pt-6">
              {isLoadingMembers ? (
                <Loader>Chargement...</Loader>
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
                      <MemberRow
                        key={member.userId}
                        member={member}
                        isAdmin={isAdmin}
                        linkedPlayerName={linkedPlayerNameByUserId.get(member.userId) ?? null}
                        onRemove={handleRemove}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players" className="mt-4 flex flex-col gap-4">
          {isAdmin && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un joueur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un joueur</DialogTitle>
                  <DialogDescription>
                    Créez une fiche joueur pour le club, avec un lien optionnel vers un compte
                    membre existant.
                  </DialogDescription>
                </DialogHeader>
                <PlayerCreateForm
                  clubId={clubId!}
                  linkableMembers={(members ?? []).filter((m) => !linkedUserIds.has(m.userId))}
                  onSuccess={() => setIsAddPlayerOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}

          <Card>
            <CardContent className="pt-6">
              {isLoadingPlayers ? (
                <Loader>Chargement...</Loader>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="flex flex-col gap-6">
          {isAdmin && (
            <Dialog open={isAddTeamOpen} onOpenChange={setIsAddTeamOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Créer une équipe</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer une équipe</DialogTitle>
                </DialogHeader>
                <TeamCreateForm clubId={clubId!} onSuccess={() => setIsAddTeamOpen(false)} />
              </DialogContent>
            </Dialog>
          )}

          {isLoadingTeams ? (
            <Loader>Chargement...</Loader>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams?.map((team) => (
                  <TeamRow key={team.id} clubId={clubId!} team={team} />
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
