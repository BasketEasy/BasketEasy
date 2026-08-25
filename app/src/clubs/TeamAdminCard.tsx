import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { FieldError } from '@basketeasy/ui/field-error';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { ApiError } from '../api/client';
import { useTeamAdminRemove } from './useTeamAdminRemove';
import { getClubErrorMessage } from './clubErrorMessages';

/** Mobile card row for the Administrateurs tab's table — see TeamAdminRow for the desktop equivalent. */
export function TeamAdminCard({
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
    <Card className="flex flex-col gap-2 p-3">
      <span className="font-medium text-charcoal">{admin.email}</span>
      {error && <FieldError>{error}</FieldError>}
      {canManage && (
        <Button
          variant="outline"
          className="self-start"
          loading={isPending}
          onClick={() =>
            removeTeamAdmin(admin.userId, {
              onError: (err) => {
                // getClubErrorMessage's 400 copy ("informations invalides")
                // is wrong for the last-admin-self-removal case — the
                // server's own message is already the correct French
                // explanation, same reasoning as TeamAdminRow's 409.
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
    </Card>
  );
}
