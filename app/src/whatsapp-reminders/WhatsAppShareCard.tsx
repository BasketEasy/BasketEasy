import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventSharePlatform, EventShareStatus } from '@basketeasy/types/whatsapp-reminder';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { respondentName } from '../guardians/respondentLabel';
import { useTeamGuestLinkEnable } from '../guest-rsvp/useTeamGuestLink';
import { copyMessage, shareMessage } from './shareMessage';
import {
  useConfirmEventShare,
  useEventWhatsAppShare,
  useInvalidateEventWhatsAppShare,
} from './useEventWhatsAppShare';

const DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

// « 04/10 à 18:12 », in the reader's own timezone: it is when they sent it.
function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${DAY.format(date)} à ${TIME.format(date)}`;
}

/** What the card says about the share's state, apart from the buttons. */
function ShareStatus({
  share,
  reminderEnabled,
}: {
  share: EventShareStatus;
  reminderEnabled: boolean | null;
}) {
  switch (share.state) {
    case 'SENT':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft" tone="structure">
            Envoyé
          </Badge>
          <Text variant="meta" size="sm">
            {share.sentAt && `Envoyé le ${formatSentAt(share.sentAt)}`}
            {share.sentBy && ` par ${share.sentBy.isMe ? 'vous' : respondentName(share.sentBy)}`}
          </Text>
        </div>
      );
    case 'PENDING':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft" tone="brand">
            À partager
          </Badge>
          <Text variant="meta" size="sm">
            Le message est prêt : envoyez-le dans le groupe WhatsApp de l’équipe.
          </Text>
        </div>
      );
    case 'SCHEDULED':
      return (
        <Text variant="meta" size="sm">
          {share.dueAt
            ? `Rappel prévu le ${formatSentAt(share.dueAt)}. Vous pouvez aussi partager dès maintenant.`
            : 'Rappel prévu. Vous pouvez aussi partager dès maintenant.'}
        </Text>
      );
    case 'EXPIRED':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" tone="neutral">
            Non partagé
          </Badge>
          <Text variant="meta" size="sm">
            L’événement a commencé sans que le message soit partagé.
          </Text>
        </div>
      );
    default:
      return (
        <Text variant="meta" size="sm">
          {reminderEnabled === false
            ? 'Rappel désactivé pour cet événement. Vous pouvez tout de même partager le message.'
            : 'Un message prêt à envoyer dans le groupe WhatsApp de l’équipe, avec le lien pour répondre sans compte.'}
        </Text>
      );
  }
}

/**
 * « Partage WhatsApp » — the manager's ready-made reminder for one upcoming
 * event. The app prepares the message; the manager sends it from their own
 * WhatsApp, so a share always ends in an explicit « Vous l'avez envoyé ? »
 * (the web gives no completion signal). The confirm row is state set on
 * click, so it is still there when the user comes back from WhatsApp.
 */
export function WhatsAppShareCard({
  clubId,
  teamId,
  eventId,
  initialShare = null,
  reminderEnabled = null,
  focusOnLoad = false,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  /** `event.whatsAppShare`: the state to paint while the message loads. */
  initialShare?: EventShareStatus | null;
  /** `event.whatsAppSettings.effective.enabled`; null when unknown. */
  reminderEnabled?: boolean | null;
  /**
   * Arriving from a notification: scroll here and focus the share button once
   * it exists. `navigator.share` needs a user gesture, so it never auto-fires.
   */
  focusOnLoad?: boolean;
}) {
  const { data, isError, isLoading, refetch } = useEventWhatsAppShare(clubId, teamId, eventId);
  const { mutate: confirm, isPending: isConfirming } = useConfirmEventShare(
    clubId,
    teamId,
    eventId,
  );
  const { mutate: enableLink, isPending: isEnabling } = useTeamGuestLinkEnable(clubId, teamId);
  const refetchShare = useInvalidateEventWhatsAppShare(clubId, teamId, eventId);
  const [pendingPlatform, setPendingPlatform] = useState<EventSharePlatform | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const isReady = data !== undefined;

  useEffect(() => {
    if (!focusOnLoad || !isReady) return;
    const button = shareButton.current;
    if (!button) return;
    if (typeof button.scrollIntoView === 'function') button.scrollIntoView({ block: 'center' });
    button.focus();
  }, [focusOnLoad, isReady]);

  if (isError) {
    return (
      <QueryError
        title="Partage indisponible"
        description="Le message à partager n’a pas pu être chargé."
        onRetry={() => refetch()}
      />
    );
  }
  if (isLoading || data === undefined) {
    return initialShare ? (
      <Card variant="panel" className="flex flex-col gap-3">
        <ShareStatus share={initialShare} reminderEnabled={reminderEnabled} />
        <Skeleton className="h-11 w-full" />
      </Card>
    ) : (
      <Skeleton className="h-24 w-full" />
    );
  }

  const share = data.shares[0];
  const message = share.message;

  if (!data.guestLinkActive || message === null) {
    return (
      <Card variant="panel" className="flex flex-col gap-3">
        <Alert variant="destructive">
          <AlertDescription>
            Le lien de réponse est désactivé : il n’y a rien à partager tant qu’il est éteint.
          </AlertDescription>
        </Alert>
        <Button
          className="self-start"
          loading={isEnabling}
          onClick={() =>
            enableLink(undefined, {
              onSuccess: () => void refetchShare(),
              onError: (err) =>
                toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
            })
          }
        >
          Réactiver le lien
        </Button>
      </Card>
    );
  }

  const isSent = share.state === 'SENT';

  const onShare = async () => {
    const platform = await shareMessage(message);
    if (platform) setPendingPlatform(platform);
  };

  const onCopy = async () => {
    try {
      setPendingPlatform(await copyMessage(message));
      toast({ variant: 'success', title: 'Message copié' });
    } catch {
      toast({ variant: 'destructive', description: 'Impossible de copier le message.' });
    }
  };

  const onConfirm = (platform: EventSharePlatform) =>
    confirm(
      { platform },
      {
        onSuccess: () => {
          setPendingPlatform(null);
          toast({ variant: 'success', title: 'Partage enregistré' });
        },
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
      },
    );

  return (
    <Card variant="panel" className="flex flex-col gap-3">
      <ShareStatus share={share} reminderEnabled={reminderEnabled} />

      <div className="flex flex-wrap gap-2">
        <Button
          ref={shareButton}
          variant={isSent ? 'outline' : 'default'}
          onClick={() => void onShare()}
        >
          {isSent ? 'Partager à nouveau' : 'Partager sur WhatsApp'}
        </Button>
        <Button variant="outline" onClick={() => void onCopy()}>
          Copier le message
        </Button>
        <Button
          variant="ghost"
          aria-expanded={showMessage}
          onClick={() => setShowMessage((open) => !open)}
        >
          Voir le message
        </Button>
      </div>

      {showMessage && (
        <Card variant="inset">
          <Text variant="body" size="sm" className="whitespace-pre-line">
            {message}
          </Text>
        </Card>
      )}

      {pendingPlatform && (
        <div role="group" aria-label="Confirmer l’envoi" className="flex flex-col gap-2">
          <Text variant="label" size="sm">
            Vous l&apos;avez envoyé dans le groupe&nbsp;?
          </Text>
          <div className="flex flex-wrap gap-2">
            <Button loading={isConfirming} onClick={() => onConfirm(pendingPlatform)}>
              Oui, c&apos;est envoyé
            </Button>
            <Button variant="ghost" onClick={() => setPendingPlatform(null)}>
              Pas encore
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
