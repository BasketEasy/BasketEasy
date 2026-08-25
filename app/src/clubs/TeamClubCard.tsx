import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { toast } from '@basketeasy/ui/toast-store';
import type { TeamClubLink } from '@basketeasy/types/teams';
import { useTeamClubRemove } from './useTeamClubRemove';
import { getClubErrorMessage } from './clubErrorMessages';

/** Mobile card row for the Clubs partenaires tab's table — see TeamClubRow for the desktop equivalent. */
export function TeamClubCard({
  clubId,
  teamId,
  link,
  canManage,
}: {
  clubId: string;
  teamId: string;
  link: TeamClubLink;
  /** Only the owning club can remove partner clubs. */
  canManage: boolean;
}) {
  const { mutate: removeTeamClub, isPending } = useTeamClubRemove(clubId, teamId);

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-charcoal">{link.clubName}</span>
        {link.isOwner && <Badge variant="secondary">Propriétaire</Badge>}
      </div>
      {canManage && !link.isOwner && (
        <Button
          variant="outline"
          className="self-start"
          loading={isPending}
          onClick={() =>
            removeTeamClub(link.clubId, {
              onSuccess: () => toast({ variant: 'success', title: 'Club partenaire retiré' }),
              onError: (err) =>
                toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
            })
          }
        >
          Retirer
        </Button>
      )}
    </Card>
  );
}
