import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

export function TeamRow({ clubId, team }: { clubId: string; team: Team }) {
  return (
    <TableRow>
      <TableCell>{team.name}</TableCell>
      <TableCell>{teamCategoryLabel(team.category)}</TableCell>
      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
      <TableCell>
        <Button asChild variant="outline">
          <Link to={`/clubs/${clubId}/teams/${team.id}`}>Gérer</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
