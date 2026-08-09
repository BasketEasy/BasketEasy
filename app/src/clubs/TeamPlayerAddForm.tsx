import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { SelectField } from '@basketeasy/ui/select-field';
import type { Player } from '@basketeasy/types/players';
import { useTeamPlayerAdd } from './useTeamPlayerAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const teamPlayerSchema = z.object({
  playerId: z.string().min(1, 'Joueur requis'),
});

type TeamPlayerFormValues = z.infer<typeof teamPlayerSchema>;

export function TeamPlayerAddForm({
  clubId,
  teamId,
  addablePlayers,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  /** Players from this club not already on the team's roster. */
  addablePlayers: Player[];
  onSuccess?: () => void;
}) {
  const { mutate: addTeamPlayer, isPending } = useTeamPlayerAdd(clubId, teamId);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamPlayerFormValues>({
    resolver: zodResolver(teamPlayerSchema),
    defaultValues: { playerId: '' },
  });

  const onSubmit = (values: TeamPlayerFormValues) => {
    addTeamPlayer(
      { playerId: values.playerId },
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

      <Controller
        control={control}
        name="playerId"
        render={({ field }) => (
          <SelectField
            label="Joueur"
            id="team-player-select"
            options={addablePlayers.map((player) => ({
              value: player.id,
              label: `${player.firstName} ${player.lastName}`,
            }))}
            value={field.value}
            onValueChange={field.onChange}
            placeholder="Choisir un joueur"
            error={errors.playerId?.message}
          />
        )}
      />

      <Button type="submit" disabled={isSubmitting || isPending || addablePlayers.length === 0}>
        Ajouter à l'effectif
      </Button>
    </form>
  );
}
