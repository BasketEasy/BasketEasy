import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { SelectField } from '@basketeasy/ui/select-field';
import { Text } from '@basketeasy/ui/text';
import type { AddTeamAdminRequest } from '@basketeasy/types/platform-admin-actions';
import type { AdminClubRef } from '@basketeasy/types/platform-admin-browse';
import { useAdminClubMembers } from '../useAdminQueries';
import { AdminActionDialogFrame, AdminReasonField, AdminRootError } from './AdminActionDialog';
import { adminActionErrorMessage, reasonSchema, toastActionDone } from './adminActionForm';
import { useAdminAction } from './useAdminAction';

const schema = z.object({
  clubId: z.string().min(1, 'Choisissez un club'),
  userId: z.string().min(1, 'Choisissez un compte'),
  reason: reasonSchema,
});

type Values = z.infer<typeof schema>;

const MEMBER_PAGE_SIZE = 100;

/**
 * Members of one club, fetched once a club is chosen. Mounted per club (by
 * `key`), so switching club never shows the previous club's members.
 */
function MemberSelect({
  clubId,
  excludedUserIds,
  control,
}: {
  clubId: string;
  excludedUserIds: ReadonlySet<string>;
  control: Control<Values>;
}) {
  const members = useAdminClubMembers(clubId, { pageSize: MEMBER_PAGE_SIZE });
  const options = (members.data?.items ?? [])
    .filter((member) => !excludedUserIds.has(member.person.id))
    .map((member) => ({
      value: member.person.id,
      label: member.person.email
        ? `${member.person.displayName} · ${member.person.email}`
        : member.person.displayName,
    }));
  const placeholder = members.isError
    ? 'Membres indisponibles'
    : members.isPending
      ? 'Chargement des membres…'
      : options.length === 0
        ? 'Aucun membre disponible'
        : 'Choisir un compte';

  return (
    <Controller
      name="userId"
      control={control}
      render={({ field, fieldState }) => (
        <SelectField
          label="Compte"
          placeholder={placeholder}
          options={options}
          value={field.value || undefined}
          onValueChange={field.onChange}
          disabled={options.length === 0}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

/**
 * Grants a TeamAdmin. The server only accepts a member of a club linked to
 * the team, so the picker is built from exactly those: a club first, then
 * one of its members who doesn't already manage the team.
 */
export function AdminAddTeamAdminDialog({
  teamId,
  clubs,
  currentAdminIds,
}: {
  teamId: string;
  clubs: AdminClubRef[];
  currentAdminIds: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useAdminAction<AddTeamAdminRequest>(`teams/${teamId}/admins`);
  const defaults: Values = {
    clubId: clubs.length === 1 ? clubs[0].id : '',
    userId: '',
    reason: '',
  };
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const clubId = watch('clubId');

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(defaults);
    setOpen(next);
  };

  const onSubmit = (values: Values) => {
    mutate(
      { userId: values.userId, reason: values.reason },
      {
        onSuccess: (result) => {
          handleOpenChange(false);
          toastActionDone(result);
        },
        onError: (error) => setError('root', { message: adminActionErrorMessage(error) }),
      },
    );
  };

  return (
    <AdminActionDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button variant="outline">Ajouter</Button>}
      title="Ajouter un gestionnaire"
      description="Le compte pourra gérer l’effectif, les événements et les infos de l’équipe, sans droits sur le reste du club."
    >
      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="mt-4 flex flex-col gap-4"
      >
        <AdminRootError message={errors.root?.message} />
        <Controller
          name="clubId"
          control={control}
          render={({ field, fieldState }) => (
            <SelectField
              label="Club"
              placeholder="Choisir un club lié"
              options={clubs.map((club) => ({ value: club.id, label: club.name }))}
              value={field.value || undefined}
              onValueChange={(next) => {
                field.onChange(next);
                setValue('userId', '');
              }}
              error={fieldState.error?.message}
            />
          )}
        />
        {clubId ? (
          <MemberSelect
            key={clubId}
            clubId={clubId}
            excludedUserIds={currentAdminIds}
            control={control}
          />
        ) : (
          <Text variant="meta" size="sm">
            Seuls les membres d’un club lié à l’équipe peuvent la gérer.
          </Text>
        )}
        <AdminReasonField registration={register('reason')} error={errors.reason?.message} />
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={isPending}>
            Ajouter
          </Button>
        </div>
      </form>
    </AdminActionDialogFrame>
  );
}
