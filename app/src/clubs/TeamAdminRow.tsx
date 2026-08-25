import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { ApiError } from '../api/client';
import { useTeamAdminRemove } from './useTeamAdminRemove';
import { getClubErrorMessage } from './clubErrorMessages';

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
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamAdmin, isPending } = useTeamAdminRemove(clubId, teamId);

  return (
    <TableRow>
      <TableCell>{admin.email}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <Button
            variant="outline"
            loading={isPending}
            onClick={() =>
              removeTeamAdmin(admin.userId, {
                onError: (err) => {
                  // getClubErrorMessage's 400 copy ("informations invalides")
                  // is wrong for the last-admin-self-removal case — the
                  // server's own message is already the correct French
                  // explanation, same reasoning as TeamAdminAddForm's 409.
                  const message =
                    err instanceof ApiError && err.status === 400
                      ? err.message
                      : getClubErrorMessage(err);
                  setError(message);
                },
              })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
