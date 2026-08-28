import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { FieldError } from '@basketeasy/ui/field-error';
import { FormField } from '@basketeasy/ui/form-field';
import { Input } from '@basketeasy/ui/input';
import { Label } from '@basketeasy/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
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

/**
 * One row of the Joueurs tab — a table row on desktop, a card below it.
 *
 * The two layouts were separate components until the design-system audit;
 * the desktop one validated with raw `useState` and the mobile one with
 * react-hook-form + zod, so the same edit form enforced different rules
 * depending on the width of the window. This keeps the stricter of the two.
 */
export function PlayerRow({
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
  const layout = useTableLayout();
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

  const linkedMemberSelect = (id?: string) => (
    <Controller
      control={control}
      name="userId"
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} aria-label="Compte lié (optionnel)">
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
  );

  const cancelButton = (
    <Button type="button" variant="ghost" onClick={cancelEditing}>
      Annuler
    </Button>
  );

  const adminActions = isAdmin ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={startEditing}>
        Modifier
      </Button>
      <Button
        variant="destructive"
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
  ) : null;

  if (layout === 'card') {
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
              <Label htmlFor={`player-${player.id}-edit-linked-member`}>
                Compte lié (optionnel)
              </Label>
              {linkedMemberSelect(`player-${player.id}-edit-linked-member`)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={isSubmitting || isUpdating}>
                Enregistrer
              </Button>
              {cancelButton}
            </div>
          </form>
        </Card>
      );
    }

    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text as="span" variant="label">
          {player.firstName} {player.lastName}
        </Text>
        <Text as="span" variant="meta">
          Compte lié : {linkedMemberEmail ?? '—'}
        </Text>
        {adminActions}
      </Card>
    );
  }

  if (isEditing) {
    // No <form> here: a form element cannot wrap a <tr>. The submit button
    // runs the same handleSubmit, so validation is identical to the card.
    return (
      <TableRow>
        <TableCell>
          <Input aria-label="Prénom" {...register('firstName')} />
          {errors.firstName?.message && <FieldError>{errors.firstName.message}</FieldError>}
        </TableCell>
        <TableCell>
          <Input aria-label="Nom" {...register('lastName')} />
          {errors.lastName?.message && <FieldError>{errors.lastName.message}</FieldError>}
        </TableCell>
        <TableCell>{linkedMemberSelect()}</TableCell>
        <TableCell className="flex flex-col gap-2">
          {errors.root?.message && <FieldError>{errors.root.message}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button
              loading={isSubmitting || isUpdating}
              onClick={() => {
                void handleSubmit(onSubmit)();
              }}
            >
              Enregistrer
            </Button>
            {cancelButton}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell>{linkedMemberEmail ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">{adminActions}</TableCell>
    </TableRow>
  );
}
