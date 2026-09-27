import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { MyChildProfile } from '@basketeasy/types/guardians';
import type { Gender } from '@basketeasy/types/teams';
import { useUpdateMyChild } from './useMyChild';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

const UNSPECIFIED_GENDER = 'unspecified';

const childSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis'),
  lastName: z.string().trim().min(1, 'Nom requis'),
  birthDate: z.string(),
  gender: z.string(),
});

type ChildFormValues = z.infer<typeof childSchema>;

/**
 * The four fields a family is the source of truth for. Licence details and
 * teams come from the federation and the club, so they aren't here at all.
 */
export function ChildProfileForm({ child }: { child: MyChildProfile }) {
  const { mutate: update, isPending } = useUpdateMyChild(child.playerId);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ChildFormValues>({
    resolver: zodResolver(childSchema),
    defaultValues: {
      firstName: child.firstName,
      lastName: child.lastName,
      birthDate: child.birthDate?.slice(0, 10) ?? '',
      gender: child.gender ?? UNSPECIFIED_GENDER,
    },
  });

  const onSubmit = (values: ChildFormValues) => {
    update(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: values.birthDate || null,
        gender: values.gender === UNSPECIFIED_GENDER ? null : (values.gender as Gender),
      },
      {
        onSuccess: () => {
          reset(values);
          toast({ variant: 'success', title: 'Profil mis à jour' });
        },
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Prénom"
          id="child-first-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <FormField
          label="Nom"
          id="child-last-name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <FormField
          label="Date de naissance"
          id="child-birth-date"
          type="date"
          error={errors.birthDate?.message}
          {...register('birthDate')}
        />
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <SelectField
              label="Sexe"
              id="child-gender"
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: UNSPECIFIED_GENDER, label: 'Non renseigné' },
                { value: 'MEN', label: 'Garçon' },
                { value: 'WOMEN', label: 'Fille' },
              ]}
            />
          )}
        />
      </div>
      <Button
        type="submit"
        className="self-start"
        disabled={!isDirty}
        loading={isSubmitting || isPending}
      >
        Enregistrer
      </Button>
    </form>
  );
}
