import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

/** Mobile card row for the Équipes tab's table — see TeamRow for the desktop equivalent. */
export function TeamListingCard({ clubId, team }: { clubId: string; team: Team }) {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <span className="font-medium text-charcoal">{team.name}</span>
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">{teamCategoryLabel(team.category)}</Badge>
        <Badge variant="outline">{teamGenderLabel(team.gender)}</Badge>
      </div>
      <Button asChild variant="outline" className="self-start">
        <Link
          to={`/clubs/${clubId}/teams/${team.id}`}
          state={{ origin: { from: 'members', clubId } }}
        >
          Gérer
        </Link>
      </Button>
    </Card>
  );
}
