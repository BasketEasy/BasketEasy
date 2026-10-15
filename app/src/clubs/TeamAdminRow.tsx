import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { ApiError } from '../api/client';
import { useTeamAdminRemove } from './useTeamAdminRemove';
import { getClubErrorMessage } from './clubErrorMessages';

/** One row of the Administrateurs tab — a table row on desktop, a card below it. */
export function TeamAdminRow({
  clubId,
  teamId,
  admin,
  canManage,
}: {
  clubId: string;
  teamId: string;
  admin: TeamAdmin;
  canManage: boolean;
}) {
  const layout = useTableLayout();
  const { mutate: removeTeamAdmin, isPending } = useTeamAdminRemove(clubId, teamId);

  const remove = () =>
    removeTeamAdmin(admin.userId, {
      onSuccess: () => toast({ variant: 'success', title: 'Administrateur retiré' }),
      onError: (err) => {
        // getClubErrorMessage's 400 copy ("informations invalides") is wrong
        // for the last-admin-self-removal case — the server's own message is
        // already the correct French explanation, same reasoning as
        // TeamAdminAddForm's 409.
        const message =
          err instanceof ApiError && err.status === 400 ? err.message : getClubErrorMessage(err);
        toast({ variant: 'destructive', description: message });
      },
    });

  const removeButton = canManage ? (
    <Button
      variant="destructive"
      loading={isPending}
      className={layout === 'card' ? 'self-start' : undefined}
      onClick={remove}
    >
      Retirer
    </Button>
  ) : null;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text as="span" variant="label" className="break-all">
          {admin.email}
        </Text>
        {removeButton}
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>{admin.email}</TableCell>
      <TableCell className="flex flex-col gap-2">{removeButton}</TableCell>
    </TableRow>
  );
}
