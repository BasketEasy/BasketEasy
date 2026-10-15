import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { TeamClubLink } from '@basketeasy/types/teams';
import { useTeamClubRemove } from './useTeamClubRemove';
import { getClubErrorMessage } from './clubErrorMessages';

/** One row of the Clubs partenaires tab — a table row on desktop, a card below it. */
export function TeamClubRow({
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
  const layout = useTableLayout();
  const { mutate: removeTeamClub, isPending } = useTeamClubRemove(clubId, teamId);

  const removeButton =
    canManage && !link.isOwner ? (
      <Button
        variant="destructive"
        loading={isPending}
        className={layout === 'card' ? 'self-start' : undefined}
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
    ) : null;

  const ownerBadge = link.isOwner ? <Badge tone="structure">Propriétaire</Badge> : null;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="label">
            {link.clubName}
          </Text>
          {ownerBadge}
        </div>
        {removeButton}
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        {link.clubName}
        {link.isOwner && (
          <Badge tone="structure" className="ml-2">
            Propriétaire
          </Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-2">{removeButton}</TableCell>
    </TableRow>
  );
}
