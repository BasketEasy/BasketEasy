import { Injectable, NotFoundException } from '@nestjs/common';
import { EventVoteCategory, TeamMemberRole } from '@prisma/client';
import type { TeamSeasonPlayerStats, TeamSeasonStats } from '@basketeasy/types/team-stats';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanActForPlayer } from '../common/acting-as';

// A French basketball season runs September to August, so a calendar year is
// the wrong window: it would cut a season in half at Christmas. seasonYear is
// the year the season *starts*, matching how the FFBB labels one ("saison
// 2026-2027"). Derived from Event.startsAt rather than stored — nothing else
// in the schema knows about seasons, and a stored column would need
// backfilling and would drift from the event it describes.
const SEASON_START_MONTH = 8; // September, zero-based.

export function seasonYearFor(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= SEASON_START_MONTH ? year : year - 1;
}

export function seasonWindow(seasonYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(seasonYear, SEASON_START_MONTH, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(seasonYear + 1, SEASON_START_MONTH, 1, 0, 0, 0, 0) - 1),
  };
}

// One decimal, computed over known values only. A null denominator gives
// null, never 0: "no measured average" and "averaged zero" are different
// claims about a player, and only one of them is safe to make from an
// illegible scoresheet.
function averageOf(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return null;
  }
  const mean = known.reduce((total, value) => total + value, 0) / known.length;
  return Math.round(mean * 10) / 10;
}

function maxOf(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.max(...known);
}

function sumOf(values: (number | null)[]): number {
  return values.reduce((total: number, value) => total + (value ?? 0), 0);
}

interface StatRow {
  teamPlayerId: string;
  points: number | null;
  fouls: number | null;
  freeThrowPoints: number | null;
  twoPointPoints: number | null;
  threePointPoints: number | null;
  eventId: string;
}

@Injectable()
export class TeamStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeamSeasonStats(
    clubId: string,
    teamId: string,
    userId: string,
    seasonYear?: number,
    forPlayerId?: string,
  ): Promise<TeamSeasonStats> {
    await this.assertTeamInClub(clubId, teamId);
    if (forPlayerId) {
      await assertCanActForPlayer(this.prisma, userId, forPlayerId);
    }
    const year = seasonYear ?? seasonYearFor(new Date());
    const { start, end } = seasonWindow(year);
    const window = { gte: start, lte: end };

    // Three queries, bounded regardless of how many matches the season holds.
    // The roster is fetched in full (not just players with data) because the
    // screen is a view of the squad: someone who has never played belongs on
    // it, at zero.
    const [roster, statRows, voteCounts, availableSeasons] = await Promise.all([
      this.prisma.teamPlayer.findMany({
        where: { teamId },
        select: {
          id: true,
          role: true,
          playerId: true,
          player: { select: { firstName: true, lastName: true, userId: true } },
        },
      }),
      this.prisma.matchPlayerStat.findMany({
        where: { event: { teamId, startsAt: window } },
        select: {
          teamPlayerId: true,
          eventId: true,
          points: true,
          fouls: true,
          freeThrowPoints: true,
          twoPointPoints: true,
          threePointPoints: true,
        },
      }),
      // Awards need no mapping — EventVote already keys on TeamPlayer — so a
      // player can carry distinctions for a match that has no scoresheet at
      // all. voterTeamPlayerId is never selected: voting stays anonymous.
      this.prisma.eventVote.groupBy({
        by: ['votedTeamPlayerId', 'category'],
        where: { event: { teamId, startsAt: window } },
        _count: { _all: true },
      }),
      this.listAvailableSeasons(teamId),
    ]);

    const rowsByPlayer = new Map<string, StatRow[]>();
    for (const row of statRows) {
      const existing = rowsByPlayer.get(row.teamPlayerId);
      if (existing) {
        existing.push(row);
      } else {
        rowsByPlayer.set(row.teamPlayerId, [row]);
      }
    }
    const awardsByPlayer = new Map<string, { mvp: number; worst: number }>();
    for (const group of voteCounts) {
      const entry = awardsByPlayer.get(group.votedTeamPlayerId) ?? { mvp: 0, worst: 0 };
      if (group.category === EventVoteCategory.BEST) {
        entry.mvp += group._count._all;
      } else {
        entry.worst += group._count._all;
      }
      awardsByPlayer.set(group.votedTeamPlayerId, entry);
    }

    const players = roster
      .map((member) =>
        toPlayerStats(
          {
            teamPlayerId: member.id,
            firstName: member.player.firstName,
            lastName: member.player.lastName,
            role: member.role,
            // The persona's row: a parent reading their child's team sees
            // the child's line highlighted, not nothing.
            isMe: forPlayerId ? member.playerId === forPlayerId : member.player.userId === userId,
          },
          rowsByPlayer.get(member.id) ?? [],
          awardsByPlayer.get(member.id) ?? { mvp: 0, worst: 0 },
        ),
      )
      .sort(byScoringThenName);

    return {
      seasonYear: year,
      seasonStart: start.toISOString(),
      seasonEnd: end.toISOString(),
      matchesPlayed: new Set(statRows.map((row) => row.eventId)).size,
      availableSeasons,
      players,
    };
  }

  // Seasons the selector can offer: those the team actually has confirmed
  // stats for. Derived from the matches' own dates rather than from a stored
  // season column, so it follows the data without a backfill.
  private async listAvailableSeasons(teamId: string): Promise<number[]> {
    const events = await this.prisma.event.findMany({
      where: { teamId, playerStats: { some: {} } },
      select: { startsAt: true },
    });
    const years = new Set(events.map((event) => seasonYearFor(event.startsAt)));
    const current = seasonYearFor(new Date());
    // The current season is always offerable, even before its first match is
    // analysed — otherwise the selector would be empty at the start of a
    // season and the screen would look broken rather than merely empty.
    years.add(current);
    return [...years].sort((a, b) => b - a);
  }

  // Duplicated from EventsService/ScoresheetsService rather than imported
  // across modules — same defense-in-depth re-verification pattern (see
  // CLAUDE.md's Teams module section).
  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }
}

function toPlayerStats(
  member: {
    teamPlayerId: string;
    firstName: string;
    lastName: string;
    role: TeamMemberRole;
    isMe: boolean;
  },
  rows: StatRow[],
  awards: { mvp: number; worst: number },
): TeamSeasonPlayerStats {
  return {
    ...member,
    // A row exists for every match the player was mapped onto the sheet for,
    // whether or not its points came back legible — so GP stays truthful even
    // when one match's totals are unknown.
    gamesPlayed: rows.length,
    pointsPerGame: averageOf(rows.map((row) => row.points)),
    foulsPerGame: averageOf(rows.map((row) => row.fouls)),
    seasonHighPoints: maxOf(rows.map((row) => row.points)),
    seasonHighFouls: maxOf(rows.map((row) => row.fouls)),
    freeThrowPoints: sumOf(rows.map((row) => row.freeThrowPoints)),
    twoPointPoints: sumOf(rows.map((row) => row.twoPointPoints)),
    threePointPoints: sumOf(rows.map((row) => row.threePointPoints)),
    totalPoints: sumOf(rows.map((row) => row.points)),
    mvpAwards: awards.mvp,
    worstPlayerAwards: awards.worst,
  };
}

// Top scorers first, since that is what the screen is read for. A player with
// no measured average sorts last rather than as a zero — they haven't scored
// nothing, they have no number yet — and ties fall back to the surname so the
// order is stable between requests.
function byScoringThenName(a: TeamSeasonPlayerStats, b: TeamSeasonPlayerStats): number {
  if (a.pointsPerGame !== b.pointsPerGame) {
    if (a.pointsPerGame === null) return 1;
    if (b.pointsPerGame === null) return -1;
    return b.pointsPerGame - a.pointsPerGame;
  }
  return a.lastName.localeCompare(b.lastName, 'fr');
}
