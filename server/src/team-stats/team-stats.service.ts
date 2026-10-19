import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventVoteCategory, TeamMemberRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  MatchStatLine,
  MatchStats,
  TeamSeasonPlayerStats,
  TeamSeasonStats,
  UpdateMatchStatsLine,
  UpdateMatchStatsRequest,
} from '@basketeasy/types/team-stats';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanActForPlayer, resolveActingTeamPlayer } from '../common/acting-as';
import { applyScoreboard, toScoreboard } from '../common/match-scoreboard';
import { asParsedScoresheetData } from '../common/parsed-scoresheet-data';
import { seasonWindow, seasonYearFor } from '../common/season';

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

  /**
   * One match's lines from its confirmed scoresheet — the typed projection
   * `MatchPlayerStat` holds, written at confirm time. Two queries after the
   * route checks: the persona's roster slot (for `isMe`) and the rows.
   * Nulls stay null: an unread total is unknown, never 0.
   */
  async getMatchStats(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<MatchStats> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      select: { id: true, venue: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const [me, rows, scoresheet] = await Promise.all([
      resolveActingTeamPlayer(this.prisma, { userId, teamId, forPlayerId }),
      this.prisma.matchPlayerStat.findMany({
        where: { eventId },
        select: {
          teamPlayerId: true,
          jerseyNumber: true,
          points: true,
          fouls: true,
          freeThrowPoints: true,
          twoPointPoints: true,
          threePointPoints: true,
          teamPlayer: { select: { player: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.eventScoresheet.findUnique({
        where: { eventId },
        select: {
          status: true,
          statsEditedAt: true,
          extraction: { select: { parsedData: true } },
        },
      }),
    ]);
    const lines: MatchStatLine[] = rows
      .map(({ teamPlayer, ...row }) => ({
        ...row,
        firstName: teamPlayer.player.firstName,
        lastName: teamPlayer.player.lastName,
        isMe: me !== null && row.teamPlayerId === me.id,
      }))
      .sort(byPointsThenName);
    return {
      hasStats: lines.length > 0,
      lines,
      // A score only counts once a manager confirmed the sheet, the same rule
      // `deriveMatchResult` applies to the event's result.
      scoreboard:
        scoresheet?.status === 'CONFIRMED'
          ? toScoreboard(event.venue, asParsedScoresheetData(scoresheet.extraction?.parsedData))
          : null,
      manuallyEdited: scoresheet?.statsEditedAt != null,
    };
  }

  /**
   * A manager's correction of a played match, after its sheet was confirmed
   * or with no sheet at all. A full replace of the score and of the player
   * lines. The sheet's `parsedData` keeps the verbatim read apart from its
   * score and periods; the per-player corrections live only in
   * `MatchPlayerStat`, which a later confirm of the sheet would overwrite,
   * hence `statsEditedAt` (see `ScoresheetsService.confirmExtraction`).
   *
   * A match with no sheet gets a MANUAL one (no file) so the score keeps one
   * read path, `deriveMatchResult`. A sheet that is not CONFIRMED yet is a
   * read still in progress or waiting for review: that flow owns its stats.
   */
  async updateMatchStats(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    request: UpdateMatchStatsRequest,
  ): Promise<MatchStats> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      select: { id: true, type: true, startsAt: true, venue: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.type !== 'MATCH') {
      throw new BadRequestException('Seul un match a des stats');
    }
    if (event.startsAt.getTime() > Date.now()) {
      throw new BadRequestException("Le match n'a pas encore eu lieu");
    }
    // The score is stored per sheet side; without the venue there is no way to
    // tell which one is ours, and a guess would credit the opposing squad.
    if (event.venue === null) {
      throw new BadRequestException(
        'Le lieu du match (domicile ou extérieur) doit être renseigné avant de saisir les stats',
      );
    }
    const venue = event.venue;
    this.assertLinesValid(request.lines);
    await this.assertLinesOnRoster(teamId, request.lines);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const sheet = await tx.eventScoresheet.findUnique({
        where: { eventId },
        select: { id: true, status: true, extraction: { select: { id: true, parsedData: true } } },
      });
      if (sheet && sheet.status !== 'CONFIRMED') {
        throw new ConflictException(
          "La feuille de ce match n'est pas encore confirmée : confirmez-la ou relancez sa lecture avant de corriger les stats",
        );
      }
      const parsedData = applyScoreboard(
        venue,
        asParsedScoresheetData(sheet?.extraction?.parsedData),
        request,
      ) as unknown as Prisma.InputJsonValue;
      if (!sheet) {
        await tx.eventScoresheet.create({
          data: {
            eventId,
            source: 'MANUAL',
            status: 'CONFIRMED',
            storageKey: null,
            statsEditedAt: now,
            extraction: {
              create: { rawResponse: {}, parsedData, reviewedByUserId: userId, reviewedAt: now },
            },
          },
        });
      } else {
        await tx.eventScoresheet.update({ where: { id: sheet.id }, data: { statsEditedAt: now } });
        if (sheet.extraction) {
          await tx.scoresheetExtraction.update({
            where: { id: sheet.extraction.id },
            data: { parsedData },
          });
        } else {
          await tx.scoresheetExtraction.create({
            data: {
              eventScoresheetId: sheet.id,
              rawResponse: {},
              parsedData,
              reviewedByUserId: userId,
              reviewedAt: now,
            },
          });
        }
      }
      // Replaced wholesale, like a re-confirm: a player taken off the list
      // must lose their row, not keep the previous read's.
      await tx.matchPlayerStat.deleteMany({ where: { eventId } });
      if (request.lines.length > 0) {
        await tx.matchPlayerStat.createMany({
          data: request.lines.map((line) => ({ eventId, ...line })),
        });
      }
    });
    return this.getMatchStats(clubId, teamId, eventId, userId);
  }

  private assertLinesValid(lines: UpdateMatchStatsLine[]): void {
    const ids = lines.map((line) => line.teamPlayerId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un même joueur ne peut pas apparaître deux fois');
    }
    const numbers = lines.flatMap((line) =>
      line.jerseyNumber === null ? [] : [line.jerseyNumber],
    );
    if (new Set(numbers).size !== numbers.length) {
      throw new BadRequestException('Un même numéro ne peut pas être associé à deux joueurs');
    }
    for (const line of lines) {
      const { points, freeThrowPoints, twoPointPoints, threePointPoints } = line;
      // Only a fully known split can contradict the total. A partly known one
      // is legal: the manager knows the points but not how they were made.
      if (
        points !== null &&
        freeThrowPoints !== null &&
        twoPointPoints !== null &&
        threePointPoints !== null &&
        freeThrowPoints + twoPointPoints + threePointPoints !== points
      ) {
        throw new BadRequestException(
          'Pour chaque joueur, 3 PTS + 2 PTS + LF doivent faire le total de PTS',
        );
      }
    }
  }

  // One query for the whole list, like the confirm flow's mapping check.
  private async assertLinesOnRoster(teamId: string, lines: UpdateMatchStatsLine[]): Promise<void> {
    if (lines.length === 0) {
      return;
    }
    const found = await this.prisma.teamPlayer.findMany({
      where: { teamId, id: { in: lines.map((line) => line.teamPlayerId) } },
      select: { id: true },
    });
    if (found.length !== lines.length) {
      throw new BadRequestException("Un joueur n'est pas dans l'effectif de cette équipe");
    }
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

// The match's top scorer first; an unread total sorts last rather than as a
// zero, and ties fall back to the surname so the order is stable.
function byPointsThenName(a: MatchStatLine, b: MatchStatLine): number {
  if (a.points !== b.points) {
    if (a.points === null) return 1;
    if (b.points === null) return -1;
    return b.points - a.points;
  }
  return a.lastName.localeCompare(b.lastName, 'fr');
}
