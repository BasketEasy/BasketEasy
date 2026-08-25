import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { FieldError } from '@basketeasy/ui/field-error';
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
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamClub, isPending } = useTeamClubRemove(clubId, teamId);

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-charcoal">{link.clubName}</span>
        {link.isOwner && <Badge variant="secondary">Propriétaire</Badge>}
      </div>
      {error && <FieldError>{error}</FieldError>}
      {canManage && !link.isOwner && (
        <Button
          variant="outline"
          className="self-start"
          loading={isPending}
          onClick={() =>
            removeTeamClub(link.clubId, { onError: (err) => setError(getClubErrorMessage(err)) })
          }
        >
          Retirer
        </Button>
      )}
    </Card>
  );
}
