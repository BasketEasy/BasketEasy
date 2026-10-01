import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { TextLink } from '@basketeasy/ui/text-link';
import { AuthCard } from './AuthCard';
import { Link } from 'react-router-dom';
import { useLogin } from './mutations';
import { getAuthErrorMessage } from './errorMessages';

const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** The fields alone, so the guardian invitation can embed them under its own title. */
export function LoginFields() {
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

      <TextLink asChild className="self-center">
        <Link to="/forgot-password">Mot de passe oublié ?</Link>
      </TextLink>
    </form>
  );
}

export function LoginForm() {
  return (
    <AuthCard
      brandLink
      eyebrow="La gestion d’équipe, simplifiée."
      title="Se connecter"
      footer={
        <>
          Pas encore de compte ?{' '}
          <TextLink asChild>
            <Link to="/register">Créer un compte</Link>
          </TextLink>
        </>
      }
    >
      <LoginFields />
    </AuthCard>
  );
}
