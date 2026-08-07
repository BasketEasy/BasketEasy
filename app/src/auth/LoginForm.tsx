import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Label } from '@basketeasy/ui/label';
import { Input } from '@basketeasy/ui/input';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { ApiError } from '../api/client';
import { useAuth } from './useAuth';

const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
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
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="login-email">Adresse e-mail</Label>
            <Input id="login-email" type="email" {...register('email')} />
            {errors.email && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="login-password">Mot de passe</Label>
            <Input id="login-password" type="password" {...register('password')} />
            {errors.password && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
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
