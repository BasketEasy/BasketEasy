import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import { toast } from '@basketeasy/ui/toast-store';
import type { Team, TeamCategory, Gender } from '@basketeasy/types/teams';
import { useTeamUpdate } from './useTeamUpdate';
import { getClubErrorMessage } from './clubErrorMessages';
import { TEAM_CATEGORY_OPTIONS, TEAM_GENDER_OPTIONS } from './teamLabels';

const teamEditSchema = z.object({
  name: z.string().trim().min(1, "Nom de l'équipe requis"),
  category: z.enum(['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS']),
  gender: z.enum(['MEN', 'WOMEN']),
});

type TeamEditFormValues = z.infer<typeof teamEditSchema>;

const toFormValues = (team: Team): TeamEditFormValues => ({
  name: team.name,
  category: team.category,
  gender: team.gender,
});

/**
 * The team's edit form, dialog-ised per the project's modal rule — editing
 * name/category/gender is a focused, self-contained edit of a multi-field
 * record, same reasoning as EventEditModal. Fully controlled by the parent
 * (TeamDetailPage's own "Modifier" button opens it) rather than owning a
 * DialogTrigger, since the header button already exists outside the dialog.
 */
export function TeamEditModal({
  clubId,
  teamId,
  team,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: updateTeam, isPending: isUpdating } = useTeamUpdate(clubId, teamId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamEditFormValues>({
    resolver: zodResolver(teamEditSchema),
    defaultValues: toFormValues(team),
  });

  // Re-sync the form every time the dialog opens, so stale values from a
  // previous open never leak into the fields — same pattern as
  // EventEditModal's reset-on-open effect.
  useEffect(() => {
    if (open) {
      reset(toFormValues(team));
    }
  }, [open, team, reset]);

  const onSubmit = (values: TeamEditFormValues) => {
    updateTeam(values, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Équipe modifiée' });
        onOpenChange(false);
      },
      onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;équipe</DialogTitle>
        </DialogHeader>
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
            id="team-edit-name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <SelectField
                label="Catégorie"
                id="team-edit-category-select"
                options={TEAM_CATEGORY_OPTIONS}
                value={field.value}
                onValueChange={(value) => field.onChange(value as TeamCategory)}
              />
            )}
          />

          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <SelectField
                label="Genre"
                id="team-edit-gender-select"
                options={TEAM_GENDER_OPTIONS}
                value={field.value}
                onValueChange={(value) => field.onChange(value as Gender)}
              />
            )}
          />

          <Button type="submit" loading={isSubmitting || isUpdating}>
            Enregistrer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
