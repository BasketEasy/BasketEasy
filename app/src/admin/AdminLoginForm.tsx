import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { FormField } from '@basketeasy/ui/form-field';
import { Text } from '@basketeasy/ui/text';
import { ApiError } from '../api/client';
import { usePlatformLogin } from './useAdminMutations';

const TOTP_DIGITS = 6;

const stepUpSchema = z.object({
  totpCode: z.string().regex(new RegExp(`^\\d{${TOTP_DIGITS}}$`), `Code à ${TOTP_DIGITS} chiffres`),
});

type StepUpValues = z.infer<typeof stepUpSchema>;

function stepUpErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) {
      return "Le back-office n'est pas activé sur ce déploiement.";
    }
    if (err.status === 403) {
      return 'Accès refusé. Contactez un opérateur si le verrouillage persiste.';
    }
    if (err.status === 401) {
      return 'Code invalide.';
    }
  }
  return 'Vérification impossible. Réessayez.';
}

/**
 * The step-up gate. Anyone with a session sees this form — it never says
 * whether the account holds a grant, because a form that rendered differently
 * for platform staff would enumerate them.
 *
 * `setError('root')` + `Alert` rather than `toast()`, matching every other
 * auth form: the control that triggered it stays on screen.
 */
export function AdminLoginForm() {
  const { mutate: submitCode, isPending } = usePlatformLogin();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<StepUpValues>({ resolver: zodResolver(stepUpSchema) });

  const onSubmit = (values: StepUpValues) => {
    submitCode(values.totpCode, {
      onError: (err) => {
        reset({ totpCode: '' });
        setError('root', { message: stepUpErrorMessage(err) });
      },
    });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Back-office Kluvo</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          <Text variant="meta">
            Saisissez le code de votre application d’authentification. La session expire au bout de
            15&nbsp;minutes et n’est pas renouvelée automatiquement.
          </Text>

          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <FormField
            label="Code de vérification"
            id="admin-totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={TOTP_DIGITS}
            autoFocus
            error={errors.totpCode?.message}
            {...register('totpCode')}
          />

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Vérification…' : 'Entrer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
