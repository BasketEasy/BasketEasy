import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { useImpersonationControls } from '../impersonation/useImpersonationControls';
import {
  AdminActionDialogFrame,
  AdminReasonField,
  AdminRootError,
} from './actions/AdminActionDialog';
import { adminActionErrorMessage, reasonSchema } from './actions/adminActionForm';
import { useStartImpersonation } from './useAdminMutations';

const schema = z.object({ reason: reasonSchema });
type Values = z.infer<typeof schema>;

/**
 * « Consulter en tant que »: opens the product as this user, read-only, for
 * 15 minutes. DATA_OFFICER only and never offered for a back-office account
 * (the server refuses both anyway). Per the validated canvas linked from
 * docs/decisions/rgpd-and-backoffice.md.
 */
export function AdminImpersonateCard({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const { mutate: start, isPending } = useStartImpersonation(userId);
  const { enter } = useImpersonationControls();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: '' } });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset({ reason: '' });
    setOpen(next);
  };

  const onSubmit = (values: Values) => {
    start(values.reason, {
      // No toast: the banner on the next screen is the outcome.
      onSuccess: (response) => {
        setOpen(false);
        enter(response);
      },
      onError: (error) => setError('root', { message: adminActionErrorMessage(error) }),
    });
  };

  return (
    <Card variant="panel" className="flex flex-col gap-3">
      <SectionHeading as="h2">Consulter en tant que</SectionHeading>
      <Text variant="meta">
        Voir l’application exactement comme cette personne, en lecture seule, 15 minutes au plus.
      </Text>
      <AdminActionDialogFrame
        open={open}
        onOpenChange={handleOpenChange}
        trigger={
          <Button variant="outline" className="self-start">
            Voir en tant que…
          </Button>
        }
        title={`Voir en tant que ${displayName}`}
        description="Vous verrez l’application avec ses données et ses droits."
      >
        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event);
          }}
          className="mt-4 flex flex-col gap-4"
        >
          <AdminRootError message={errors.root?.message} />
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <Text as="li" size="sm">
              Lecture seule : aucune réponse, aucune modification.
            </Text>
            <Text as="li" size="sm">
              15 minutes au plus, un rechargement de page y met fin.
            </Text>
            <Text as="li" size="sm">
              La consultation et son motif sont inscrits au journal d’audit.
            </Text>
          </ul>
          <AdminReasonField
            registration={register('reason')}
            error={errors.reason?.message}
            placeholder="Ex. : ticket #482, ne reçoit pas les convocations de son fils"
          />
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              Démarrer la consultation
            </Button>
          </div>
        </form>
      </AdminActionDialogFrame>
    </Card>
  );
}
