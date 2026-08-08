import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useClubCreate } from './useClubCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const clubSchema = z.object({
  name: z.string().min(2, 'Le nom du club doit contenir au moins 2 caractères'),
});

type ClubFormValues = z.infer<typeof clubSchema>;

export function ClubCreateForm() {
  const navigate = useNavigate();
  const { mutate: createClub, isPending } = useClubCreate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClubFormValues>({ resolver: zodResolver(clubSchema) });

  const onSubmit = (values: ClubFormValues) => {
    createClub(values, {
      onSuccess: (club) => navigate(`/clubs/${club.id}/players`),
      onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un club</CardTitle>
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
            label="Nom du club"
            id="club-name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Button type="submit" disabled={isSubmitting || isPending}>
            Créer le club
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
