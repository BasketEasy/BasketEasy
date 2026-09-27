import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import type { GuardianInvitePreview } from '@basketeasy/types/guardians';
import { useLogout } from '../auth/mutations';
import { useAcceptGuardianInviteAsMe } from './useGuardianInvite';
import { getGuardianInviteErrorMessage, isConsentRequired } from './guardianErrorMessages';
import { GuardianConsentField } from './GuardianConsentField';
import { GUARDIAN_CONSENT_REQUIRED_MESSAGE } from './guardianConsent';

/**
 * The logged-in path: a parent who already plays, coaches or follows another
 * child adds this one to the same account (design decision 6).
 */
export function GuardianInviteAsMe({
  token,
  preview,
  email,
}: {
  token: string;
  preview: GuardianInvitePreview;
  email: string;
}) {
  const navigate = useNavigate();
  const { mutate: accept, isPending } = useAcceptGuardianInviteAsMe(token);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | undefined>();
  const [rootError, setRootError] = useState<string | null>(null);

  const handleAccept = () => {
    if (preview.requiresConsent && !consent) {
      setConsentError(GUARDIAN_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setRootError(null);
    accept(
      { consent: preview.requiresConsent ? consent : undefined },
      {
        onSuccess: () => navigate('/dashboard', { replace: true }),
        onError: (err) => {
          if (isConsentRequired(err)) {
            setConsentError(GUARDIAN_CONSENT_REQUIRED_MESSAGE);
            return;
          }
          setRootError(getGuardianInviteErrorMessage(err));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {rootError && (
        <Alert variant="destructive">
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      )}
      <Text variant="meta">
        Vous êtes connecté·e avec <strong>{email}</strong>. {preview.playerFirstName} sera ajouté·e
        à ce compte, à côté de vos propres équipes.
      </Text>
      {preview.requiresConsent && (
        <GuardianConsentField
          id="guardian-as-me-consent"
          childFirstName={preview.playerFirstName}
          checked={consent}
          onCheckedChange={(value) => {
            setConsent(value);
            setConsentError(undefined);
          }}
          error={consentError}
        />
      )}
      <Button type="button" loading={isPending} onClick={handleAccept}>
        Suivre {preview.playerFirstName}
      </Button>
      <Button type="button" variant="ghost" disabled={isLoggingOut} onClick={() => logout()}>
        Ce n&apos;est pas vous ? Se déconnecter
      </Button>
    </div>
  );
}
