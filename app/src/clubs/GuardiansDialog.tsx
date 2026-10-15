import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Input } from '@basketeasy/ui/input';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import {
  MAX_GUARDIANS_PER_PLAYER,
  MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER,
  type GuardianInviteLink,
  type PlayerGuardianSummary,
} from '@basketeasy/types/guardians';
import type { Player } from '@basketeasy/types/players';
import {
  useCancelGuardianInvite,
  useCreateGuardianInvite,
  usePlayerGuardians,
  useRemoveGuardian,
} from './usePlayerGuardians';
import { getClubErrorMessage } from './clubErrorMessages';

const LIMIT_REACHED = `Limite atteinte : ${MAX_GUARDIANS_PER_PLAYER} parents et ${MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER} invitations en attente au maximum.`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

function guardianName(guardian: PlayerGuardianSummary): string {
  const name = [guardian.firstName, guardian.lastName].filter(Boolean).join(' ');
  return name || guardian.email;
}

/**
 * The admin's « Parents » dialog for one player: who is linked, which invite
 * links are still pending, and a fresh link to send to one more parent. One
 * link per parent, several can be pending at once — unlike the player's own
 * invite, which regenerates in place. Mirrors PlayerInviteDialog.
 */
export function GuardiansDialog({ clubId, player }: { clubId: string; player: Player }) {
  const [isOpen, setIsOpen] = useState(false);
  const [link, setLink] = useState<GuardianInviteLink | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, isRefetching } = usePlayerGuardians(
    clubId,
    player.id,
    isOpen,
  );
  const { mutate: createInvite, isPending: isCreating } = useCreateGuardianInvite(
    clubId,
    player.id,
  );
  const { mutate: cancelInvite, isPending: isCancelling } = useCancelGuardianInvite(
    clubId,
    player.id,
  );
  const { mutate: removeGuardian, isPending: isRemoving } = useRemoveGuardian(clubId, player.id);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setLink(null);
      setConfirmingRemoval(null);
    }
  };

  const handleGenerate = () => {
    createInvite(undefined, {
      onSuccess: (result) => setLink(result),
      onError: (err) =>
        toast({
          variant: 'destructive',
          description: getClubErrorMessage(err, { 400: LIMIT_REACHED }),
        }),
    });
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast({ variant: 'success', title: 'Lien copié' });
    } catch {
      toast({ variant: 'destructive', description: 'Impossible de copier le lien.' });
    }
  };

  const handleCancel = (inviteId: string) => {
    cancelInvite(inviteId, {
      onSuccess: () => toast({ variant: 'success', title: 'Invitation annulée' }),
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });
  };

  const handleRemove = (guardian: PlayerGuardianSummary) => {
    removeGuardian(guardian.userId, {
      onSuccess: () => {
        setConfirmingRemoval(null);
        toast({ variant: 'success', title: `${guardianName(guardian)} ne suit plus ce joueur` });
      },
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });
  };

  const atLimit =
    data !== undefined &&
    (data.guardians.length >= MAX_GUARDIANS_PER_PLAYER ||
      data.pendingInvites.length >= MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {player.guardianCount > 0 ? `Parents (${player.guardianCount})` : 'Inviter un parent'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Parents — {player.firstName} {player.lastName}
          </DialogTitle>
          <DialogDescription>
            Un parent lié peut répondre aux convocations, choisir le trajet et reçoit les
            notifications de {player.firstName}. Envoyez un lien différent à chaque parent.
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
        ) : isLoading || !data ? (
          <Loader>Chargement…</Loader>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <SectionHeading>Parents liés</SectionHeading>
              {data.guardians.length === 0 ? (
                <EmptyState
                  title="Aucun parent lié"
                  description="Générez un lien ci-dessous et envoyez-le au parent."
                />
              ) : (
                data.guardians.map((guardian) => (
                  <Card key={guardian.userId} variant="inset" className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <Text as="span" variant="label">
                          {guardianName(guardian)}
                        </Text>
                        <Text as="span" variant="meta" className="break-all">
                          {guardian.email}
                        </Text>
                        <Text as="span" variant="meta">
                          {guardian.consentGivenAt
                            ? `Autorisation donnée le ${formatDate(guardian.consentGivenAt)}`
                            : `Lié le ${formatDate(guardian.linkedAt)}`}
                        </Text>
                      </div>
                      {confirmingRemoval !== guardian.userId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingRemoval(guardian.userId)}
                        >
                          Retirer
                        </Button>
                      )}
                    </div>
                    {confirmingRemoval === guardian.userId && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Text as="span" variant="meta">
                          Retirer l&apos;accès de {guardianName(guardian)} ?
                        </Text>
                        <Button
                          variant="destructive"
                          size="sm"
                          loading={isRemoving}
                          onClick={() => handleRemove(guardian)}
                        >
                          Confirmer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingRemoval(null)}
                        >
                          Annuler
                        </Button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </section>

            {data.pendingInvites.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionHeading>Invitations en attente</SectionHeading>
                {data.pendingInvites.map((invite) => (
                  <Card
                    key={invite.id}
                    variant="inset"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <Text as="span" variant="meta">
                      Lien créé le {formatDate(invite.createdAt)} · expire le{' '}
                      {formatDate(invite.expiresAt)}
                    </Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isCancelling}
                      onClick={() => handleCancel(invite.id)}
                    >
                      Annuler
                    </Button>
                  </Card>
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <SectionHeading>Nouveau lien</SectionHeading>
              {link ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      aria-label="Lien d'invitation parent"
                      value={link.url}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button type="button" onClick={() => void handleCopy()}>
                      Copier
                    </Button>
                  </div>
                  <Text variant="meta">
                    Ce lien ne s&apos;affiche qu&apos;une fois et expire le{' '}
                    {formatDate(link.expiresAt)}. Envoyez-le à un seul parent.
                  </Text>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    loading={isCreating}
                    disabled={atLimit}
                    onClick={handleGenerate}
                  >
                    Générer un lien parent
                  </Button>
                  {atLimit && <Text variant="meta">{LIMIT_REACHED}</Text>}
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
