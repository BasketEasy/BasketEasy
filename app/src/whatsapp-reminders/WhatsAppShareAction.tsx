import { useEffect, useRef, useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventSharePlatform } from '@basketeasy/types/whatsapp-reminder';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { copyMessage, shareMessage } from './shareMessage';

/** Records a share; the action closes its confirm row and toasts on success. */
export type ConfirmShare = (
  platform: EventSharePlatform,
  callbacks: { onSuccess: () => void; onError: (err: unknown) => void },
) => void;

/**
 * The share + confirm flow, shared by every card that puts a message in front
 * of a manager: the event's reminder and update, and a cancellation on the
 * team page. The app prepares the message; the manager sends it from their own
 * WhatsApp, so every share ends in an explicit « Vous l'avez envoyé ? » (the
 * web gives no completion signal). The confirm row is state set on click, so
 * it is still there when the user comes back from WhatsApp.
 */
export function WhatsAppShareAction({
  message,
  isSent,
  confirm,
  isConfirming,
  focusOnMount = false,
}: {
  message: string;
  /** Already shared once: the button offers to do it again, quietly. */
  isSent: boolean;
  confirm: ConfirmShare;
  isConfirming: boolean;
  /**
   * Arriving from a notification: scroll here and focus the share button.
   * `navigator.share` needs a user gesture, so it never auto-fires.
   */
  focusOnMount?: boolean;
}) {
  const [pendingPlatform, setPendingPlatform] = useState<EventSharePlatform | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    const button = shareButton.current;
    if (!button) return;
    if (typeof button.scrollIntoView === 'function') button.scrollIntoView({ block: 'center' });
    button.focus();
  }, [focusOnMount]);

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
    confirm(platform, {
      onSuccess: () => {
        setPendingPlatform(null);
        toast({ variant: 'success', title: 'Partage enregistré' });
      },
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });

  return (
    <>
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
    </>
  );
}
