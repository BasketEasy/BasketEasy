import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Loader } from '@basketeasy/ui/loader';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Text } from '@basketeasy/ui/text';
import { useConfirmEmail } from './accountSecurityMutations';
import { getAccountSecurityErrorMessage } from './errorMessages';

/**
 * Consumes a verification token from the URL.
 *
 * A mutation fired from an effect rather than a query, because confirming is
 * a write: it must run exactly once per visit, and must not be re-run by a
 * refetch-on-focus or a retry. The ref guards React 18 StrictMode's
 * double-invoked mount effect, which would otherwise burn the token on the
 * first call and show the second call's "lien déjà utilisé" error.
 */
export function VerifyEmailCard({ token }: { token: string }) {
  const { mutate: confirmEmail, isPending, isSuccess, isError, error } = useConfirmEmail();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    confirmEmail({ token });
  }, [confirmEmail, token]);

  if (isPending || (!isSuccess && !isError)) {
    return (
      <Card>
        <CardContent className="py-8">
          <Loader>Confirmation de votre adresse…</Loader>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lien invalide</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>{getAccountSecurityErrorMessage(error)}</AlertDescription>
          </Alert>
          <Text variant="meta">
            Connectez-vous puis demandez un nouvel e-mail de confirmation depuis « Mon profil ».
          </Text>
          <Button asChild variant="ghost">
            <Link to="/login">Retour à la connexion</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresse confirmée</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Text>Merci ! Votre adresse e-mail est confirmée.</Text>
        <Button asChild>
          <Link to="/dashboard">Aller au tableau de bord</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
