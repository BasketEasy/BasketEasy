import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { Text } from '@basketeasy/ui/text';
import { useRequestPasswordReset } from './accountSecurityMutations';
import { getAccountSecurityErrorMessage } from './errorMessages';

const forgotPasswordSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { mutate: requestReset, isPending } = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (values: ForgotPasswordFormValues) => {
    requestReset(values, {
      onSuccess: () => setSent(true),
      onError: (err) => setError('root', { message: getAccountSecurityErrorMessage(err) }),
    });
  };

  // The endpoint answers 204 whether or not the address has an account, and
  // this screen has to keep that promise: a confirmation that appeared only
  // for known addresses would be the user-enumeration oracle the API
  // carefully avoids being. So the copy says what *would* happen, not what
  // did.
  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vérifiez votre boîte mail</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Text>
            Si un compte Kluvo existe pour cette adresse, un e-mail vient d’y être envoyé avec un
            lien pour choisir un nouveau mot de passe.
          </Text>
          <Text variant="meta">Le lien est valable une heure.</Text>
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
        <CardTitle>Mot de passe oublié</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Text variant="meta">
            Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un
            nouveau mot de passe.
          </Text>

          <FormField
            label="Adresse e-mail"
            id="forgot-password-email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" loading={isSubmitting || isPending}>
            Envoyer le lien
          </Button>

          <Button asChild type="button" variant="ghost">
            <Link to="/login">Retour à la connexion</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
