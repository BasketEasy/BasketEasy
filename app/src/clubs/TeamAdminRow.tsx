import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
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
            disabled={isPending}
            onClick={() =>
              removeTeamAdmin(admin.userId, { onError: (err) => setError(getClubErrorMessage(err)) })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
