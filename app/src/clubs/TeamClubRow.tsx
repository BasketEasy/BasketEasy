import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamClubLink } from '@basketeasy/types/teams';
import { useTeamClubRemove } from './useTeamClubRemove';
import { getClubErrorMessage } from './clubErrorMessages';

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
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamClub, isPending } = useTeamClubRemove(clubId, teamId);

  return (
    <TableRow>
      <TableCell>
        {link.clubName}
        {link.isOwner && (
          <Badge variant="secondary" className="ml-2">
            Propriétaire
          </Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {canManage && !link.isOwner && (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              removeTeamClub(link.clubId, { onError: (err) => setError(getClubErrorMessage(err)) })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
