import { useNavigate } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

/** Mobile card row for the Équipes tab's table — see TeamRow for the desktop equivalent. */
export function TeamListingCard({ clubId, team }: { clubId: string; team: Team }) {
  const navigate = useNavigate();

  return (
    <Card className="flex flex-col gap-2 p-3">
      <span className="font-medium text-charcoal">{team.name}</span>
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">{teamCategoryLabel(team.category)}</Badge>
        <Badge variant="outline">{teamGenderLabel(team.gender)}</Badge>
      </div>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}
      >
        Gérer
      </Button>
    </Card>
  );
}
