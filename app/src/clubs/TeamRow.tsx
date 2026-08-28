import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

/** One row of the Équipes tab — a table row on desktop, a card below it. */
export function TeamRow({ clubId, team }: { clubId: string; team: Team }) {
  const layout = useTableLayout();

  const manageLink = (
    <Link to={`/clubs/${clubId}/teams/${team.id}`} state={{ origin: { from: 'members', clubId } }}>
      Gérer
    </Link>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <Text as="span" variant="label">
          {team.name}
        </Text>
        <div className="flex flex-wrap gap-1">
          <Badge tone="structure">{teamCategoryLabel(team.category)}</Badge>
          <Badge variant="outline" tone="neutral">
            {teamGenderLabel(team.gender)}
          </Badge>
        </div>
        <Button asChild variant="outline" className="self-start">
          {manageLink}
        </Button>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>{team.name}</TableCell>
      <TableCell>{teamCategoryLabel(team.category)}</TableCell>
      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
      <TableCell>
        <Button asChild variant="outline">
          {manageLink}
        </Button>
      </TableCell>
    </TableRow>
  );
}
