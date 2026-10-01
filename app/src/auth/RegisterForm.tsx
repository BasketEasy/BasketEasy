import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { Link } from 'react-router-dom';
import { useRegister } from './mutations';
import { getAuthErrorMessage } from './errorMessages';
import { AuthCard } from './AuthCard';

const registerSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { mutate: register, isPending } = useRegister();
  const {
    register: registerField,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = (values: RegisterFormValues) => {
    register(values, {
      onError: (err) => setError('root', { message: getAuthErrorMessage(err) }),
    });
  };

  return (
    <AuthCard
      brandLink
      eyebrow="La gestion d’équipe, simplifiée."
      title="Créer un compte"
      footer={
        <>
          <TextLink asChild>
            <Link to="/login">J&apos;ai déjà un compte</Link>
          </TextLink>
        </>
      }
    >
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
          {...registerField('email')}
        />

        <FormField
          label="Mot de passe"
          id="register-password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...registerField('password')}
        />

        <Button type="submit" loading={isSubmitting || isPending}>
          Créer un compte
        </Button>

        <Text variant="meta" className="text-center">
          En créant un compte, vous acceptez les{' '}
          <TextLink asChild>
            <Link to="/cgu">CGU</Link>
          </TextLink>{' '}
          et la{' '}
          <TextLink asChild>
            <Link to="/confidentialite">politique de confidentialité</Link>
          </TextLink>
          .
        </Text>
      </form>
    </AuthCard>
  );
}
