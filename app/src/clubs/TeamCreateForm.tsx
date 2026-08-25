import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import type { TeamCategory, TeamGender } from '@basketeasy/types/teams';
import { useTeamCreate } from './useTeamCreate';
import { getClubErrorMessage } from './clubErrorMessages';
import { TEAM_CATEGORY_OPTIONS, TEAM_GENDER_OPTIONS } from './teamLabels';

const teamSchema = z.object({
  name: z.string().min(1, "Nom de l'équipe requis"),
  category: z.enum(['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS'], {
    error: 'Catégorie requise',
  }),
  gender: z.enum(['MEN', 'WOMEN'], { error: 'Genre requis' }),
});

type TeamFormValues = z.infer<typeof teamSchema>;

export function TeamCreateForm({ clubId, onSuccess }: { clubId: string; onSuccess?: () => void }) {
  const { mutate: createTeam, isPending } = useTeamCreate(clubId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', category: undefined, gender: undefined },
  });

  const onSubmit = (values: TeamFormValues) => {
    createTeam(
      { name: values.name, category: values.category, gender: values.gender },
      {
        onSuccess: () => {
          reset();
          onSuccess?.();
        },
        onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
      },
    );
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
        label="Nom de l'équipe"
        id="team-name"
        error={errors.name?.message}
        {...register('name')}
      />

      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <SelectField
            label="Catégorie"
            id="team-category-select"
            options={TEAM_CATEGORY_OPTIONS}
            value={field.value}
            onValueChange={(value) => field.onChange(value as TeamCategory)}
            placeholder="Choisir une catégorie"
            error={errors.category?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="gender"
        render={({ field }) => (
          <SelectField
            label="Genre"
            id="team-gender-select"
            options={TEAM_GENDER_OPTIONS}
            value={field.value}
            onValueChange={(value) => field.onChange(value as TeamGender)}
            placeholder="Choisir un genre"
            error={errors.gender?.message}
          />
        )}
      />

      <Button type="submit" loading={isSubmitting || isPending}>
        Créer l'équipe
      </Button>
    </form>
  );
}
