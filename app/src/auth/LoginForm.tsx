import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useLogin } from './mutations';
import { getAuthErrorMessage } from './errorMessages';

const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { mutate: login, isPending } = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginFormValues) => {
    login(values, {
      onError: (err) => setError('root', { message: getAuthErrorMessage(err) }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
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
            id="login-email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <FormField
            label="Mot de passe"
            id="login-password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" loading={isSubmitting || isPending}>
            Se connecter
          </Button>

          <Button type="button" variant="ghost" onClick={onSwitchToRegister}>
            Créer un compte
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
