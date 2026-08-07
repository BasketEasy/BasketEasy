import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useRegisterMutation } from './mutations';
import { getAuthErrorMessage } from './errorMessages';

const registerSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const registerMutation = useRegisterMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await registerMutation.mutateAsync(values);
    } catch (err) {
      setError('root', { message: getAuthErrorMessage(err) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
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
            label="Adresse e-mail"
            id="register-email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <FormField
            label="Mot de passe"
            id="register-password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" disabled={isSubmitting || registerMutation.isPending}>
            Créer un compte
          </Button>

          <Button type="button" variant="ghost" onClick={onSwitchToLogin}>
            J&apos;ai déjà un compte
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
