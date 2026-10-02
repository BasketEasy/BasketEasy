import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import type { MatchStatLine } from '@basketeasy/types/team-stats';
import { getInitials } from './getInitials';
import { formatCount } from './teamStatsFormat';
import { useMatchStats } from './useMatchStats';

const COLUMNS = [
  'Joueur',
  'PTS',
  <abbr key="fautes" title="Fautes">
    FTES
  </abbr>,
  '3 PTS',
  '2 PTS',
  <abbr key="lf" title="Lancers francs">
    LF
  </abbr>,
];

function shortName(line: MatchStatLine): string {
  return `${line.firstName} ${line.lastName.charAt(0).toUpperCase()}.`;
}

function MeBadge() {
  return (
    <Badge variant="soft" tone="brand" size="sm">
      Vous
    </Badge>
  );
}

/**
 * One player's line — a table row on desktop, a person row below it
 * (responsive-table convention). The point counts per basket value only
 * show in the table: a phone card keeps points and fouls, the two numbers
 * read at a glance.
 */
function MatchStatRow({ line }: { line: MatchStatLine }) {
  const layout = useTableLayout();
  const identity = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{getInitials(line.firstName, line.lastName)}</AvatarFallback>
      </Avatar>
      <Text as="span" variant="label" size="sm">
        {shortName(line)}
      </Text>
      {line.isMe && <MeBadge />}
    </>
  );

  if (layout === 'card') {
    return (
      <Card
        variant="inset"
        tone={line.isMe ? 'brand' : 'neutral'}
        className="flex items-center gap-2.5"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">{identity}</span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <Text as="span" variant="display" size="lg" className="tabular">
            {formatCount(line.points)}
            <Text as="span" variant="meta" size="xs">
              {' '}
              pts
            </Text>
          </Text>
          <Text as="span" variant="meta" size="xs" className="tabular">
            {formatCount(line.fouls)} fautes
          </Text>
        </span>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2.5">{identity}</span>
      </TableCell>
      <TableCell className="tabular">{formatCount(line.points)}</TableCell>
      <TableCell className="tabular">{formatCount(line.fouls)}</TableCell>
      <TableCell className="tabular">{formatCount(line.threePointPoints)}</TableCell>
      <TableCell className="tabular">{formatCount(line.twoPointPoints)}</TableCell>
      <TableCell className="tabular">{formatCount(line.freeThrowPoints)}</TableCell>
    </TableRow>
  );
}

/**
 * « Stats du match »: every player's line once a manager confirmed the
 * scoresheet. Renders nothing until then (the scoresheet flow below it is
 * what the reader acts on). Mounted only when its section is open, and held
 * back before kickoff, so it never costs a request on page load for nothing.
 * An unknown value is `—`, never 0.
 */
export function MatchStatsTable({
  clubId,
  teamId,
  eventId,
  hasStarted,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  hasStarted: boolean;
}) {
  const isDesktop = useIsDesktopViewport();
  const { data, isLoading, isError, refetch, isRefetching } = useMatchStats(
    clubId,
    teamId,
    eventId,
    { enabled: hasStarted },
  );
  if (!hasStarted) return null;
  if (isError) return <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />;
  if (isLoading) return <SkeletonList rows={2} variant="card" />;
  if (!data?.hasStats) return null;
  const table = (
    <ResponsiveTable columns={COLUMNS} className="gap-2">
      {data.lines.map((line) => (
        <MatchStatRow key={line.teamPlayerId} line={line} />
      ))}
    </ResponsiveTable>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeading as="h3">Stats du match</SectionHeading>
      {/* A table needs a surface of its own; the phone cards bring theirs. The
          split columns only exist in the table layout, so does their legend. */}
      {isDesktop ? (
        <Card variant="inset" className="flex flex-col gap-2">
          {table}
          <Text variant="meta" size="xs">
            Points marqués par type de panier, pas un pourcentage de réussite.
          </Text>
        </Card>
      ) : (
        table
      )}
    </div>
  );
}
