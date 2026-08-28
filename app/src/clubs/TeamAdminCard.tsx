import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { toast } from '@basketeasy/ui/toast-store';
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
  const { mutate: removeTeamAdmin, isPending } = useTeamAdminRemove(clubId, teamId);

  return (
    <Card variant="inset" className="flex flex-col gap-2">
      <span className="font-medium text-charcoal">{admin.email}</span>
      {canManage && (
        <Button
          variant="outline"
          className="self-start"
          loading={isPending}
          onClick={() =>
            removeTeamAdmin(admin.userId, {
              onSuccess: () => toast({ variant: 'success', title: 'Administrateur retiré' }),
              onError: (err) => {
                // getClubErrorMessage's 400 copy ("informations invalides")
                // is wrong for the last-admin-self-removal case — the
                // server's own message is already the correct French
                // explanation, same reasoning as TeamAdminRow's 409.
                const message =
                  err instanceof ApiError && err.status === 400
                    ? err.message
                    : getClubErrorMessage(err);
                toast({ variant: 'destructive', description: message });
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
