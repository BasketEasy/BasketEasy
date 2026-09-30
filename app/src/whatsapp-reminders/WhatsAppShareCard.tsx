import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type {
  EventShareChange,
  EventShareStatus,
  EventShareType,
} from '@basketeasy/types/whatsapp-reminder';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { respondentName } from '../guardians/respondentLabel';
import { useTeamGuestLinkEnable } from '../guest-rsvp/useTeamGuestLink';
import { WhatsAppShareAction, type ConfirmShare } from './WhatsAppShareAction';
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

/** What a share says about its state, apart from the buttons. */
function ShareStatus({
  share,
  reminderEnabled,
}: {
  share: EventShareStatus;
  reminderEnabled: boolean | null;
}) {
  const isUpdate = share.type === 'UPDATE';
  switch (share.state) {
    case 'SENT':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft" tone="structure">
            {isUpdate ? 'Changement envoyé' : 'Envoyé'}
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
            {isUpdate ? 'Changement à partager' : 'À partager'}
          </Badge>
          <Text variant="meta" size="sm">
            {isUpdate
              ? 'Le groupe a déjà reçu le message : envoyez la mise à jour.'
              : 'Le message est prêt : envoyez-le dans le groupe WhatsApp de l’équipe.'}
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

/** « Heure de début : ~~15:30~~ → 16:00 »: what the group read, and what it should read now. */
function ChangeList({ changes }: { changes: EventShareChange[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1" aria-label="Ce qui a changé">
      {changes.map((change) => (
        <li key={change.label}>
          <Text as="span" variant="body" size="sm">
            {change.label} :{' '}
            <Text as="span" variant="meta" size="sm" className="line-through">
              {change.from}
            </Text>{' '}
            → {change.to}
          </Text>
        </li>
      ))}
    </ul>
  );
}

/**
 * « Partage WhatsApp » — the manager's ready-made messages for one upcoming
 * event: the reminder, and above it the update raised when the event changed
 * after the group was told. Each ends in the same explicit « Vous l'avez
 * envoyé ? » (see `WhatsAppShareAction`).
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
  /** Arriving from a notification: bring the first share button into focus. */
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

  const reminder = data.shares.find((s) => s.type === 'REMINDER');
  const update = data.shares.find(
    (s) => s.type === 'UPDATE' && (s.state === 'PENDING' || s.state === 'SENT'),
  );

  if (!data.guestLinkActive || !reminder || reminder.message === null) {
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

  const confirmType =
    (type: Exclude<EventShareType, 'CANCELLATION'>): ConfirmShare =>
    (platform, callbacks) =>
      confirm({ type, platform }, callbacks);

  // The update comes first: it is what the manager was notified about, and the
  // reminder below stays as history of what the group was first told.
  const sections = [update, reminder].filter((s): s is NonNullable<typeof s> => s !== undefined);

  return (
    <Card variant="panel" className="flex flex-col gap-4">
      {sections.map((share, index) => (
        <section key={share.type} className="flex flex-col gap-3">
          <ShareStatus share={share} reminderEnabled={reminderEnabled} />
          <ChangeList changes={share.changes} />
          <WhatsAppShareAction
            message={share.message ?? ''}
            isSent={share.state === 'SENT'}
            confirm={confirmType(share.type as 'REMINDER' | 'UPDATE')}
            isConfirming={isConfirming}
            focusOnMount={focusOnLoad && index === 0}
          />
        </section>
      ))}
    </Card>
  );
}
