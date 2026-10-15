import { useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useAccount } from './useAccount';
import { useRequestEmailVerification } from './accountSecurityMutations';
import { getAccountSecurityErrorMessage } from './errorMessages';

/**
 * Prompts an unverified account to confirm its address.
 *
 * Mounted in `ProtectedRoute`, the one place that renders on every protected
 * page at both breakpoints — inside `AppHeader` it would be invisible on a
 * phone, inside `AppBottomNav` invisible on a desktop.
 *
 * Nothing here blocks: an unverified account keeps full access to its own
 * team, and only `EmailVerifiedGuard`'s three routes (creating a club,
 * adding a member, granting a team admin) refuse. A player invited to a
 * roster who mistyped their address must never be locked out of it.
 *
 * Dismissal is per page-load, not persisted: a banner remembered forever is
 * one the user can silence and then never satisfy, and there is nothing
 * worth a localStorage key here.
 */
export function EmailVerificationBanner() {
  const { user } = useAccount();
  const [dismissed, setDismissed] = useState(false);
  const { mutate: requestVerification, isPending } = useRequestEmailVerification();

  if (!user || user.emailVerified || dismissed) return null;

  const resend = () => {
    requestVerification(undefined, {
      // A completed mutation whose trigger is about to be dismissed — a
      // toast, not an inline message, per CLAUDE.md's feedback rule.
      onSuccess: () =>
        toast({
          variant: 'success',
          title: 'E-mail envoyé',
          description: `Un lien de confirmation vient d’être envoyé à ${user.email}.`,
        }),
      onError: (err) =>
        toast({ variant: 'destructive', description: getAccountSecurityErrorMessage(err) }),
    });
  };

  return (
    <div className="px-4 pt-3 md:px-6">
      <Alert className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* AlertDescription renders a <p>, so everything inside it stays
            inline-level: a nested <p> is invalid HTML and browsers split the
            paragraph apart rather than nesting it. Both lines are spans made
            block by the flex column. */}
        <AlertDescription className="flex flex-col gap-0.5">
          <Text as="span" variant="label" size="sm">
            Confirmez votre adresse e-mail
          </Text>
          <Text as="span" variant="meta">
            Un lien a été envoyé à {user.email}. La confirmation est nécessaire pour créer un club
            ou donner des droits d’administration.
          </Text>
        </AlertDescription>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" loading={isPending} onClick={resend}>
            Renvoyer l’e-mail
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Plus tard
          </Button>
        </div>
      </Alert>
    </div>
  );
}
