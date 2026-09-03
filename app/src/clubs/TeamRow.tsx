import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { ChevronRightIcon } from '@basketeasy/ui/icons/chevron-right';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { Team } from '@basketeasy/types/teams';
import { teamCategoryLabel, teamGenderLabel } from './teamLabels';

/** One row of the Équipes tab — a table row on desktop, a card below it. */
export function TeamRow({ clubId, team }: { clubId: string; team: Team }) {
  const layout = useTableLayout();

  const href = `/clubs/${clubId}/teams/${team.id}`;
  const linkState = { origin: { from: 'members' as const, clubId } };

  if (layout === 'card') {
    return (
      <Link to={href} state={linkState} className={cn('block rounded-lg no-underline', focusRing)}>
        <Card variant="inset" className="flex flex-row items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Text as="span" variant="label">
              {team.name}
            </Text>
            <div className="flex flex-wrap gap-1">
              <Badge tone="structure">{teamCategoryLabel(team.category)}</Badge>
              <Badge variant="outline" tone="neutral">
                {teamGenderLabel(team.gender)}
              </Badge>
            </div>
          </div>
          <ChevronRightIcon tone="secondary" className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Card>
      </Link>
    );
  }

  return (
    <TableRow>
      <TableCell>{team.name}</TableCell>
      <TableCell>{teamCategoryLabel(team.category)}</TableCell>
      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
      <TableCell>
        <Button asChild variant="outline">
          <Link to={href} state={linkState}>
            Gérer
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
