import { useState, type ReactNode } from 'react';
import { Button } from '@basketeasy/ui/button';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { Input } from '@basketeasy/ui/input';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  useTeamGuestLink,
  useTeamGuestLinkDisable,
  useTeamGuestLinkEnable,
  useTeamGuestLinkRegenerate,
} from './useTeamGuestLink';

const EXPOSURE =
  "Toute personne ayant ce lien voit les prénoms de l'équipe et les événements des 14 prochains jours (notes comprises), et peut répondre pour n'importe quel joueur.";

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * « Lien de réponse sans compte » — the team's shared RSVP link, for players
 * who never made an account. The card always says what the link exposes:
 * whoever holds it can answer for anyone, which the coach reviews through the
 * « via lien » mark and the history on the event roster.
 *
 * No heading and no card of its own: it is the content of the team page's
 * « Lien invité » accordion item, whose trigger is the heading and whose
 * flush card is the surface.
 */
export function TeamGuestLinkSettings({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, isLoading, refetch } = useTeamGuestLink(clubId, teamId);
  const { mutate: enable, isPending: isEnabling } = useTeamGuestLinkEnable(clubId, teamId);
  const { mutate: regenerate, isPending: isRegenerating } = useTeamGuestLinkRegenerate(
    clubId,
    teamId,
  );
  const { mutate: disable, isPending: isDisabling } = useTeamGuestLinkDisable(clubId, teamId);

  const [confirming, setConfirming] = useState<'regenerate' | 'disable' | null>(null);

  const onError = (err: unknown) =>
    toast({ variant: 'destructive', description: getClubErrorMessage(err) });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ variant: 'success', title: 'Lien copié' });
    } catch {
      toast({ variant: 'destructive', description: 'Impossible de copier le lien.' });
    }
  };

  const share = async (url: string) => {
    try {
      await navigator.share({ title: 'Répondre aux événements', url });
    } catch {
      // Dismissing the share sheet rejects: nothing went wrong.
    }
  };

  let body: ReactNode;
  if (isError) {
    return (
      <QueryError
        title="Lien indisponible"
        description="Le lien de réponse de l’équipe n’a pas pu être chargé."
        onRetry={() => refetch()}
      />
    );
  }
  if (isLoading || data === undefined) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (data === null) {
    body = (
      <div className="flex flex-col gap-3">
        <Text variant="meta" size="sm">
          Un lien à poster une fois dans le groupe WhatsApp : les joueurs sans compte y choisissent
          leur nom et répondent aux événements des 14 prochains jours.
        </Text>
        <Text variant="meta" size="xs">
          {EXPOSURE}
        </Text>
        <Button
          className="self-start"
          loading={isEnabling}
          onClick={() =>
            enable(undefined, {
              onSuccess: () => toast({ variant: 'success', title: 'Lien activé' }),
              onError,
            })
          }
        >
          Activer le lien
        </Button>
      </div>
    );
  } else {
    const { url } = data;
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            readOnly
            aria-label="Lien de réponse"
            className="min-w-0 flex-1"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" onClick={() => void copy(url)}>
            Copier
          </Button>
          {canShare && (
            <Button type="button" variant="outline" onClick={() => void share(url)}>
              Partager
            </Button>
          )}
        </div>
        <Text variant="meta" size="xs">
          {EXPOSURE}
        </Text>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button variant="outline">Générer un nouveau lien</Button>}
            title="Générer un nouveau lien ?"
            description="L'ancien lien cessera de fonctionner immédiatement. Pensez à partager le nouveau dans le groupe."
            confirmLabel="Générer un nouveau lien"
            open={confirming === 'regenerate'}
            onOpenChange={(open) => setConfirming(open ? 'regenerate' : null)}
            isPending={isRegenerating}
            onConfirm={() =>
              regenerate(undefined, {
                onSuccess: () => toast({ variant: 'success', title: 'Nouveau lien généré' }),
                onError,
                onSettled: () => setConfirming(null),
              })
            }
          />
          <ConfirmDialog
            trigger={<Button variant="destructive">Désactiver</Button>}
            title="Désactiver le lien ?"
            description="Le lien cessera de fonctionner immédiatement. Le réactiver plus tard générera un autre lien."
            confirmLabel="Désactiver"
            open={confirming === 'disable'}
            onOpenChange={(open) => setConfirming(open ? 'disable' : null)}
            isPending={isDisabling}
            onConfirm={() =>
              disable(undefined, {
                onSuccess: () => toast({ variant: 'success', title: 'Lien désactivé' }),
                onError,
                onSettled: () => setConfirming(null),
              })
            }
          />
        </div>
      </div>
    );
  }

  return body;
}
