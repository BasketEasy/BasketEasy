import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { PointsRepartitionBar } from '@basketeasy/ui/points-repartition-bar';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import type { TeamSeasonPlayerStats } from '@basketeasy/types/team-stats';
import { getInitials } from './getInitials';
import { emptyRepartitionLabel, formatAverage, formatCount } from './teamStatsFormat';

export function AwardBadges({ player }: { player: TeamSeasonPlayerStats }) {
  if (player.mvpAwards === 0 && player.worstPlayerAwards === 0) {
    return (
      <Text as="span" variant="meta">
        —
      </Text>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {player.mvpAwards > 0 && (
        <Badge variant="soft" tone="accent" className="gap-1.5">
          <TrophyIcon size="sm" aria-hidden="true" />
          <span className="tabular">MVP &times;{player.mvpAwards}</span>
        </Badge>
      )}
      {player.worstPlayerAwards > 0 && (
        <Badge variant="soft" tone="muted" className="gap-1.5">
          <ShieldIcon size="sm" aria-hidden="true" />
          <span className="tabular">En difficulté &times;{player.worstPlayerAwards}</span>
        </Badge>
      )}
    </span>
  );
}

function Repartition({ player, empty }: { player: TeamSeasonPlayerStats; empty: string | null }) {
  const label = `Répartition des points de ${player.firstName} ${player.lastName}`;
  return (
    <span className="flex items-center gap-3">
      {/* Fixed width, not flex-1: the table cell has no width of its own to
          grow into, and a bar that stretches to fill whatever space is left
          in the row draws a different length per player for a reason that
          has nothing to do with their stats. shrink-0 stops the "X pts"
          label next to it squeezing the bar on a narrow viewport instead. */}
      <PointsRepartitionBar
        className="w-48 shrink-0"
        label={label}
        threePointPoints={player.threePointPoints}
        twoPointPoints={player.twoPointPoints}
        freeThrowPoints={player.freeThrowPoints}
      />
      {empty ? (
        <Text as="span" variant="meta" className="whitespace-nowrap">
          {empty}
        </Text>
      ) : (
        <Text as="span" variant="meta" className="whitespace-nowrap font-bold tabular">
          {player.totalPoints} pts
        </Text>
      )}
    </span>
  );
}

function PlayerIdentity({ player, large }: { player: TeamSeasonPlayerStats; large?: boolean }) {
  return (
    <>
      <Avatar size={large ? 'md' : 'sm'}>
        <AvatarFallback tone={player.role === 'COACH' ? 'brand' : 'structure'}>
          {getInitials(player.firstName, player.lastName)}
        </AvatarFallback>
      </Avatar>
      <span className="flex flex-grow flex-wrap items-center gap-1.5">
        <Text as="span" variant="label" size={large ? 'lg' : 'md'}>
          {player.firstName} {player.lastName}
        </Text>
        {player.isMe && (
          <Badge variant="soft" tone="brand" size="sm">
            vous
          </Badge>
        )}
      </span>
    </>
  );
}

/** One tile of the mobile card's three-across average row. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-2.5 py-2">
      <Text as="span" variant="eyebrow">
        {label}
      </Text>
      <span className="font-heading text-2xl font-extrabold leading-none tabular">{value}</span>
    </div>
  );
}

/**
 * One roster member's season — a table row on desktop, a card below it. One
 * component rather than a Row/Card pair, per the responsive-table convention:
 * the formatting rules above (em dash for an unknown average, why a bar is
 * empty) are the part worth writing once.
 */
export function TeamStatsRow({ player }: { player: TeamSeasonPlayerStats }) {
  const layout = useTableLayout();
  const emptyReason = emptyRepartitionLabel(player);

  if (layout === 'card') {
    return (
      <Card
        variant="inset"
        tone={player.isMe ? 'brand' : 'neutral'}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2.5">
          <PlayerIdentity player={player} large />
          <AwardBadges player={player} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="MJ" value={String(player.gamesPlayed)} />
          <StatTile label="PTS/M" value={formatAverage(player.pointsPerGame)} />
          <StatTile label="FA/M" value={formatAverage(player.foulsPerGame)} />
        </div>

        <div className="flex items-center gap-4">
          <Text as="span" variant="meta">
            Meilleur total PTS{' '}
            <strong className="font-bold tabular text-charcoal">
              {formatCount(player.seasonHighPoints)}
            </strong>
          </Text>
          <Text as="span" variant="meta">
            Meilleur total FA{' '}
            <strong className="font-bold tabular text-charcoal">
              {formatCount(player.seasonHighFouls)}
            </strong>
          </Text>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <Text as="span" variant="eyebrow">
              Répartition des points
            </Text>
            {/* Same distinction the table row makes: "0 pts" would claim a
                player scored nothing when their sheet was simply unread. */}
            {emptyReason ? (
              <Text as="span" variant="meta">
                {emptyReason}
              </Text>
            ) : (
              <Text as="span" variant="label" size="sm" className="tabular">
                {player.totalPoints} pts
              </Text>
            )}
          </div>
          <PointsRepartitionBar
            className="h-4"
            label={`Répartition des points de ${player.firstName} ${player.lastName}`}
            threePointPoints={player.threePointPoints}
            twoPointPoints={player.twoPointPoints}
            freeThrowPoints={player.freeThrowPoints}
            // RepartitionLegend right below already prints each count next
            // to its swatch — the bar stays purely visual here so the two
            // don't repeat the same number.
            showSegmentCounts={false}
          />
          {!emptyReason && <RepartitionLegend player={player} />}
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <PlayerIdentity player={player} />
        </div>
      </TableCell>
      <TableCell className="text-center tabular">{player.gamesPlayed}</TableCell>
      <TableCell className="text-center font-bold tabular">
        {formatAverage(player.pointsPerGame)}
      </TableCell>
      <TableCell className="text-center tabular">{formatAverage(player.foulsPerGame)}</TableCell>
      <TableCell className="text-center tabular">{formatCount(player.seasonHighPoints)}</TableCell>
      <TableCell className="text-center tabular">{formatCount(player.seasonHighFouls)}</TableCell>
      <TableCell>
        <Repartition player={player} empty={emptyReason} />
      </TableCell>
      <TableCell>
        <AwardBadges player={player} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The mobile card's own legend. The desktop table carries one legend above the
 * whole table instead — repeating it per row there would be noise — but a card
 * is read on its own, so the counts travel with it.
 */
function RepartitionLegend({ player }: { player: TeamSeasonPlayerStats }) {
  const entries = [
    { key: 'three', swatch: 'bg-points-three', label: '3 pts', value: player.threePointPoints },
    { key: 'two', swatch: 'bg-points-two', label: '2 pts', value: player.twoPointPoints },
    { key: 'free', swatch: 'bg-points-free', label: 'LF', value: player.freeThrowPoints },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map((entry) => (
        <Text key={entry.key} as="span" variant="meta" className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${entry.swatch}`} />
          {entry.label} <strong className="font-bold tabular text-charcoal">{entry.value}</strong>
        </Text>
      ))}
    </div>
  );
}
