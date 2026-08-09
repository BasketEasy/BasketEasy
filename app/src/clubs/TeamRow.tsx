import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

export function TeamRow({ clubId, team }: { clubId: string; team: Team }) {
  const navigate = useNavigate();

  return (
    <TableRow>
      <TableCell>{team.name}</TableCell>
      <TableCell>{teamCategoryLabel(team.category)}</TableCell>
      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
      <TableCell>
        <Button variant="outline" onClick={() => navigate(`/clubs/${clubId}/teams/${team.id}`)}>
          Gérer
        </Button>
      </TableCell>
    </TableRow>
  );
}
