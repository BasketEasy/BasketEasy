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
import { useAuth } from './AuthContext';

const registerSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register: registerUser } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null);
    try {
      await registerUser(values.email, values.password);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
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
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="register-email">Adresse e-mail</Label>
            <Input id="register-email" type="email" {...register('email')} />
            {errors.email && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="register-password">Mot de passe</Label>
            <Input id="register-password" type="password" {...register('password')} />
            {errors.password && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
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
