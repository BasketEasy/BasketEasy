import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { PouleTeamStanding } from '@basketeasy/types/ffbb';

/**
 * One poule standings row — a table row on desktop, a card below it, per
 * the responsive-table convention. `isOurTeam` gets the same brand-tone
 * highlight the app already uses for "this concerns you" (the convocation
 * card, TeamStatsRow's `isMe`), not a new colour at this call site.
 */
export function PouleStandingRow({
  rank,
  standing,
}: {
  rank: number;
  standing: PouleTeamStanding;
}) {
  const layout = useTableLayout();
  const { teamLabel, played, won, lost, points, isOurTeam } = standing;

  if (layout === 'card') {
    return (
      <Card variant="inset" tone={isOurTeam ? 'brand' : 'neutral'} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Text as="span" variant="meta" className="tabular">
            {rank}
          </Text>
          <span className="flex flex-grow flex-wrap items-center gap-1.5">
            <Text as="span" variant="label">
              {teamLabel}
            </Text>
            {isOurTeam && (
              <Badge variant="soft" tone="brand" size="sm">
                nous
              </Badge>
            )}
          </span>
          <Text as="span" variant="label" size="sm" className="tabular">
            {points} pts
          </Text>
        </div>
        <Text as="span" variant="meta" className="tabular">
          {played} J · {won} G · {lost} P
        </Text>
      </Card>
    );
  }

  return (
    <TableRow className={isOurTeam ? 'bg-orange-tint' : undefined}>
      <TableCell className="tabular">{rank}</TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5">
          <Text as="span" variant="label" tone={isOurTeam ? 'brand' : undefined}>
            {teamLabel}
          </Text>
          {isOurTeam && (
            <Badge variant="soft" tone="brand" size="sm">
              nous
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="text-center tabular">{played}</TableCell>
      <TableCell className="text-center tabular">{won}</TableCell>
      <TableCell className="text-center tabular">{lost}</TableCell>
      <TableCell className="text-center tabular font-bold">{points}</TableCell>
    </TableRow>
  );
}
