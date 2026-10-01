import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Loader } from '@basketeasy/ui/loader';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Text } from '@basketeasy/ui/text';
import { useConfirmEmail } from './accountSecurityMutations';
import { getAccountSecurityErrorMessage } from './errorMessages';
import { AuthCard } from './AuthCard';

type ConfirmState =
  { status: 'pending' } | { status: 'success' } | { status: 'error'; message: string };

/**
 * Consumes a verification token from the URL.
 *
 * A mutation fired from a mount effect rather than a query, because
 * confirming is a *write*: it must run exactly once per visit, and must never
 * be re-run by a refetch-on-focus or a retry. Two consequences, both of which
 * this component has to handle explicitly:
 *
 * 1. **The ref guard.** React 18 StrictMode double-invokes the mount effect
 *    in dev; without it the first call burns the token and the visitor is
 *    shown the second call's "lien déjà utilisé".
 * 2. **`mutateAsync` + local state, not the mutation's own flags or its
 *    per-call callbacks.** StrictMode's simulated unmount tears the mutation
 *    observer down while the request is still in flight, and TanStack Query
 *    then delivers nothing to it — neither the status flags nor the
 *    `mutate(vars, { onSuccess })` callbacks, both of which are the
 *    observer's. Either way the card sits on "Confirmation…" forever, which
 *    is exactly what it did before this was written this way.
 *    `mutateAsync`'s promise belongs to the mutation itself, not to an
 *    observer, so it settles regardless; component state survives the
 *    simulated remount, so setting it from the continuation is safe.
 */
export function VerifyEmailCard({ token }: { token: string }) {
  const { mutateAsync: confirmEmail } = useConfirmEmail();
  const [state, setState] = useState<ConfirmState>({ status: 'pending' });
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    confirmEmail({ token })
      .then(() => setState({ status: 'success' }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: getAccountSecurityErrorMessage(err) }),
      );
  }, [confirmEmail, token]);

  if (state.status === 'pending') {
    return (
      <AuthCard title="Confirmation en cours">
        <Loader>Confirmation de votre adresse…</Loader>
      </AuthCard>
    );
  }

  if (state.status === 'error') {
    return (
      <AuthCard title="Lien invalide">
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        <Text variant="meta">
          Connectez-vous puis demandez un nouvel e-mail de confirmation depuis « Mon profil ».
        </Text>
        <Button asChild variant="ghost">
          <Link to="/login">Retour à la connexion</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Adresse confirmée">
      <Text>Merci ! Votre adresse e-mail est confirmée.</Text>
      <Button asChild>
        <Link to="/dashboard">Aller au tableau de bord</Link>
      </Button>
    </AuthCard>
  );
}
