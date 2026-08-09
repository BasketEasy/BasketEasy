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
import type { ClubMember } from '@basketeasy/types/club-members';
import { usePlayerCreate } from './usePlayerCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const UNLINKED = 'none';

const playerSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  userId: z.string(),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

export function PlayerCreateForm({
  clubId,
  linkableMembers = [],
  onSuccess,
}: {
  clubId: string;
  /** Club members not yet linked to another player, offered as a link target. */
  linkableMembers?: ClubMember[];
  onSuccess?: () => void;
}) {
  const { mutate: createPlayer, isPending } = usePlayerCreate(clubId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: { firstName: '', lastName: '', userId: UNLINKED },
  });

  const onSubmit = (values: PlayerFormValues) => {
    createPlayer(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        userId: values.userId === UNLINKED ? undefined : values.userId,
      },
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
        label="Prénom"
        id="player-first-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Nom"
        id="player-last-name"
        error={errors.lastName?.message}
        {...register('lastName')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="player-linked-member">Compte lié (optionnel)</Label>
        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                const member = linkableMembers.find((m) => m.userId === value);
                if (member?.firstName && member?.lastName) {
                  setValue('firstName', member.firstName, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  setValue('lastName', member.lastName, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }
              }}
            >
              <SelectTrigger id="player-linked-member" aria-label="Compte lié (optionnel)">
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

      <Button type="submit" disabled={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
