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
import { useResetPassword } from './accountSecurityMutations';
import { getAccountSecurityErrorMessage } from './errorMessages';

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    // Bound to the confirmation field, not the form root: the mismatch is
    // about *that* input, and FieldError renders next to it.
    path: ['confirmPassword'],
    message: 'Les deux mots de passe ne correspondent pas',
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const { mutate: resetPassword, isPending } = useResetPassword();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = (values: ResetPasswordFormValues) => {
    resetPassword(
      { token, password: values.password },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setError('root', { message: getAccountSecurityErrorMessage(err) }),
      },
    );
  };

  // No auto-login on success, deliberately: resetting revokes every refresh
  // token the account had, and signing the visitor straight back in would
  // hide the fact that every other device has just been signed out — which
  // is the reassurance someone recovering a compromised account came for.
  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe modifié</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Text>
            Votre mot de passe a été modifié. Toutes vos sessions ouvertes ont été déconnectées.
          </Text>
          <Button asChild>
            <Link to="/login">Se connecter</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choisir un nouveau mot de passe</CardTitle>
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

          <FormField
            label="Nouveau mot de passe"
            id="reset-password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <FormField
            label="Confirmer le mot de passe"
            id="reset-password-confirm"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" loading={isSubmitting || isPending}>
            Enregistrer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
