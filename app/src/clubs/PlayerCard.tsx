import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
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
import { usePlayerUpdate } from './usePlayerUpdate';
import { usePlayerDelete } from './usePlayerDelete';
import { getClubErrorMessage } from './clubErrorMessages';

const UNLINKED = 'none';

const playerEditSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  userId: z.string(),
});

type PlayerEditFormValues = z.infer<typeof playerEditSchema>;

function defaultValuesFor(player: Player): PlayerEditFormValues {
  return {
    firstName: player.firstName,
    lastName: player.lastName,
    userId: player.userId ?? UNLINKED,
  };
}

/** Mobile card row for the Joueurs tab's table — see PlayerRow for the desktop equivalent. */
export function PlayerCard({
  clubId,
  player,
  isAdmin,
  linkedMemberEmail,
  linkableMembers,
}: {
  clubId: string;
  player: Player;
  isAdmin: boolean;
  /** Email of the member this player is linked to, if any. */
  linkedMemberEmail: string | null;
  /** Club members this player can be linked to: unlinked ones, plus its own current link. */
  linkableMembers: ClubMember[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { mutate: updatePlayer, isPending: isUpdating } = usePlayerUpdate(clubId);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlayerEditFormValues>({
    resolver: zodResolver(playerEditSchema),
    defaultValues: defaultValuesFor(player),
  });

  const startEditing = () => {
    reset(defaultValuesFor(player));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    reset(defaultValuesFor(player));
    setIsEditing(false);
  };

  const onSubmit = (values: PlayerEditFormValues) => {
    updatePlayer(
      {
        playerId: player.id,
        dto: {
          firstName: values.firstName,
          lastName: values.lastName,
          userId: values.userId === UNLINKED ? null : values.userId,
        },
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Joueur modifié' });
          setIsEditing(false);
        },
        onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
      },
    );
  };

  if (isEditing) {
    return (
      <Card variant="inset">
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-2"
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={isSubmitting || isUpdating}>
              Enregistrer
            </Button>
            <Button type="button" variant="ghost" onClick={cancelEditing}>
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card variant="inset" className="flex flex-col gap-2">
      <span className="font-medium text-charcoal">
        {player.firstName} {player.lastName}
      </span>
      <span className="text-sm text-muted">Compte lié : {linkedMemberEmail ?? '—'}</span>
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={startEditing}>
            Modifier
          </Button>
          <Button
            variant="outline"
            loading={isDeleting}
            onClick={() =>
              deletePlayer(player.id, {
                onSuccess: () => toast({ variant: 'success', title: 'Joueur supprimé' }),
                onError: (err) =>
                  toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
              })
            }
          >
            Supprimer
          </Button>
        </div>
      )}
    </Card>
  );
}
