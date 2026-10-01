import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { CountBadge } from '@basketeasy/ui/count-badge';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useAccount } from '../auth/useAccount';
import { useAccountUpdate } from '../account/useAccountUpdate';
import { getAccountErrorMessage } from '../account/accountErrorMessages';
import { useNotifications } from './useNotifications';
import { usePushSubscription } from './usePushSubscription';

/**
 * The body of the account page's « Notifications » fold (the accordion item
 * is the card and owns the title). Delivery preferences, plus the mobile entry point to /notifications — on a
 * phone the bottom bar is structurally fixed at four slots, so this page is
 * where everything the desktop header holds lives instead (the same
 * reasoning as the club switcher and logout already on it).
 *
 * Two channels, two very different kinds of setting. E-mail is an account
 * preference stored server-side, so it follows the reader across devices.
 * Push is a property of *this browser* — it exists if this browser has a
 * subscription and cannot exist anywhere else — so it is not a stored
 * preference at all, and its control reflects browser state rather than a
 * column. Presenting them as two identical checkboxes would be a lie about
 * what turning each one off actually does.
 */
export function NotificationPreferencesCard() {
  const { user } = useAccount();
  const { mutate: updateAccount, isPending } = useAccountUpdate();
  const { data } = useNotifications({ limit: 1 });
  const push = usePushSubscription();

  const unreadCount = data?.unreadCount ?? 0;

  const setEmailEnabled = (enabled: boolean) => {
    updateAccount(
      { emailNotificationsEnabled: enabled },
      {
        onError: (err) =>
          toast({ variant: 'destructive', description: getAccountErrorMessage(err) }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline">
          <Link to="/notifications">Voir mes notifications</Link>
        </Button>
        <CountBadge count={unreadCount} size="md" />
        {unreadCount > 0 && <span className="sr-only">{unreadCount} non lues</span>}
      </div>

      <label className="flex items-start gap-3">
        <Checkbox
          className="mt-0.5"
          checked={user?.emailNotificationsEnabled ?? true}
          disabled={isPending}
          onCheckedChange={(checked) => setEmailEnabled(checked === true)}
        />
        <span className="flex flex-col gap-0.5">
          <Text as="span" variant="label" size="sm">
            Recevoir les notifications par e-mail
          </Text>
          <Text variant="meta">
            Les notifications restent visibles dans l’application même si vous les désactivez ici.
          </Text>
        </span>
      </label>

      {push.support === 'available' && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={push.isBusy}
              // 'denied' can only be undone in browser settings — offering
              // a button that re-prompts would do nothing at all, since the
              // browser suppresses a second prompt after a refusal.
              disabled={push.permission === 'denied'}
              onClick={() => void (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
            >
              {push.isSubscribed
                ? 'Désactiver les notifications sur cet appareil'
                : 'Activer les notifications sur cet appareil'}
            </Button>
          </div>
          <Text variant="meta">
            {push.permission === 'denied'
              ? 'Les notifications sont bloquées pour ce site dans les réglages de votre navigateur.'
              : 'Les notifications push sont propres à ce navigateur : activez-les sur chaque appareil que vous utilisez.'}
          </Text>
        </div>
      )}
    </div>
  );
}
