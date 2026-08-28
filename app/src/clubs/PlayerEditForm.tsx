import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import { toast } from '@basketeasy/ui/toast-store';
import type { Player } from '@basketeasy/types/players';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { Gender } from '@basketeasy/types/teams';
import { usePlayerUpdate } from './usePlayerUpdate';
import { getClubErrorMessage } from './clubErrorMessages';

const UNLINKED = 'none';
const UNSPECIFIED_GENDER = 'unspecified';

const playerEditSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  userId: z.string(),
  nationalId: z.string().max(40, 'Maximum 40 caractères'),
  licenseNumber: z.string().max(40, 'Maximum 40 caractères'),
  birthDate: z.string(),
  gender: z.string(),
  licenseType: z.string().max(20, 'Maximum 20 caractères'),
});

type PlayerEditFormValues = z.infer<typeof playerEditSchema>;

function defaultValuesFor(player: Player): PlayerEditFormValues {
  return {
    firstName: player.firstName,
    lastName: player.lastName,
    userId: player.userId ?? UNLINKED,
    nationalId: player.nationalId ?? '',
    licenseNumber: player.licenseNumber ?? '',
    birthDate: player.birthDate?.slice(0, 10) ?? '',
    gender: player.gender ?? UNSPECIFIED_GENDER,
    licenseType: player.licenseType ?? '',
  };
}

/** Dialog-based edit form for a player's full info, used by both the desktop row and mobile card. */
export function PlayerEditForm({
  clubId,
  player,
  linkableMembers,
  onSuccess,
}: {
  clubId: string;
  player: Player;
  /** Club members this player can be linked to: unlinked ones, plus its own current link. */
  linkableMembers: ClubMember[];
  onSuccess?: () => void;
}) {
  const { mutate: updatePlayer, isPending } = usePlayerUpdate(clubId);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlayerEditFormValues>({
    resolver: zodResolver(playerEditSchema),
    defaultValues: defaultValuesFor(player),
  });

  const onSubmit = (values: PlayerEditFormValues) => {
    updatePlayer(
      {
        playerId: player.id,
        dto: {
          firstName: values.firstName,
          lastName: values.lastName,
          userId: values.userId === UNLINKED ? null : values.userId,
          nationalId: values.nationalId.trim() || null,
          licenseNumber: values.licenseNumber.trim() || null,
          birthDate: values.birthDate || null,
          gender: values.gender === UNSPECIFIED_GENDER ? null : (values.gender as Gender),
          licenseType: values.licenseType.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Joueur modifié' });
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
        label="Prénom"
        id={`player-${player.id}-edit-first-name`}
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Nom"
        id={`player-${player.id}-edit-last-name`}
        error={errors.lastName?.message}
        {...register('lastName')}
      />
      <FormField
        label="Date de naissance"
        id={`player-${player.id}-edit-birth-date`}
        type="date"
        error={errors.birthDate?.message}
        {...register('birthDate')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`player-${player.id}-edit-gender`}>Sexe</Label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={`player-${player.id}-edit-gender`} aria-label="Sexe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSPECIFIED_GENDER}>Non renseigné</SelectItem>
                <SelectItem value="MEN">Homme</SelectItem>
                <SelectItem value="WOMEN">Femme</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <FormField
        label="N° national (optionnel)"
        id={`player-${player.id}-edit-national-id`}
        error={errors.nationalId?.message}
        {...register('nationalId')}
      />
      <FormField
        label="N° licence (optionnel)"
        id={`player-${player.id}-edit-license-number`}
        error={errors.licenseNumber?.message}
        {...register('licenseNumber')}
      />
      <FormField
        label="Type de licence (optionnel)"
        id={`player-${player.id}-edit-license-type`}
        error={errors.licenseType?.message}
        {...register('licenseType')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`player-${player.id}-edit-linked-member`}>Compte lié (optionnel)</Label>
        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={`player-${player.id}-edit-linked-member`}
                aria-label="Compte lié (optionnel)"
              >
                <SelectValue placeholder="Aucun compte lié" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED}>Aucun compte lié</SelectItem>
                {linkableMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <Button type="submit" loading={isSubmitting || isPending}>
        Enregistrer
      </Button>
    </form>
  );
}
