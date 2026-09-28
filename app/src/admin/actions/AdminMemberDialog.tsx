import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import type { ClubRole } from '@basketeasy/types/club-members';
import type {
  AdminReasonRequest,
  ChangeClubRoleRequest,
} from '@basketeasy/types/platform-admin-actions';
import type { AdminClubMember } from '@basketeasy/types/platform-admin-browse';
import { AdminActionDialogFrame, AdminReasonField, AdminRootError } from './AdminActionDialog';
import { adminActionErrorMessage, reasonSchema, toastActionDone } from './adminActionForm';
import { useAdminAction } from './useAdminAction';

const schema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
  reason: reasonSchema,
});

type Values = z.infer<typeof schema>;

function RoleLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Text as="span" variant="label" size="sm">
        {title}
      </Text>
      <Text as="span" variant="meta" size="xs">
        {detail}
      </Text>
    </span>
  );
}

/**
 * One membership: change its role, or remove it. Both paths share the
 * reason, so they sit in one dialog with two submit buttons rather than a
 * second dialog opened from the first. The last admin is refused by the
 * server (409), and the refusal lands in the dialog's alert.
 */
export function AdminMemberDialog({
  clubId,
  clubName,
  member,
}: {
  clubId: string;
  clubName: string;
  member: AdminClubMember;
}) {
  const [open, setOpen] = useState(false);
  const base = `clubs/${clubId}/members/${member.person.id}`;
  const changeRole = useAdminAction<ChangeClubRoleRequest>(`${base}/role`);
  const remove = useAdminAction<AdminReasonRequest>(`${base}/remove`);
  const defaults: Values = { role: member.role, reason: '' };
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const isPending = changeRole.isPending || remove.isPending;

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(defaults);
    setOpen(next);
  };

  const callbacks = {
    onSuccess: (result: Parameters<typeof toastActionDone>[0]) => {
      handleOpenChange(false);
      toastActionDone(result);
    },
    onError: (error: unknown) => setError('root', { message: adminActionErrorMessage(error) }),
  };

  const submitRole = handleSubmit((values) => {
    if (values.role === member.role) {
      setError('role', { message: 'Choisissez un autre rôle que le rôle actuel.' });
      return;
    }
    changeRole.mutate({ role: values.role, reason: values.reason }, callbacks);
  });
  const submitRemove = handleSubmit((values) =>
    remove.mutate({ reason: values.reason }, callbacks),
  );

  return (
    <AdminActionDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant="outline" size="sm">
          Gérer
        </Button>
      }
      title={`Gérer ${member.person.displayName}`}
      description={`Adhésion à ${clubName}. Retirer du club conserve sa fiche joueur, détachée du compte.`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          void submitRole(event);
        }}
        className="mt-4 flex flex-col gap-4"
      >
        <AdminRootError message={errors.root?.message} />
        <div className="flex flex-col gap-1.5">
          <Text as="span" id="member-role-label" variant="label" size="sm">
            Rôle
          </Text>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <RadioCardGroup<ClubRole>
                aria-labelledby="member-role-label"
                tone="choice"
                indicator
                value={field.value}
                onChange={field.onChange}
                className="grid grid-cols-2 gap-2"
                options={[
                  {
                    value: 'ADMIN',
                    render: () => <RoleLabel title="Admin" detail="Gère le club" />,
                  },
                  {
                    value: 'MEMBER',
                    render: () => <RoleLabel title="Membre" detail="Accès à ses équipes" />,
                  },
                ]}
              />
            )}
          />
          <FieldError>{errors.role?.message}</FieldError>
        </div>
        <AdminReasonField registration={register('reason')} error={errors.reason?.message} />
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={isPending}>
            Changer le rôle
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Text as="span" variant="meta" size="sm">
            Ou retirer l’adhésion, avec le même motif.
          </Text>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => void submitRemove()}
          >
            Retirer du club
          </Button>
        </div>
      </form>
    </AdminActionDialogFrame>
  );
}
