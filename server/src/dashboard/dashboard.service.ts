import { Injectable } from '@nestjs/common';
import type { EventType } from '@basketeasy/types/events';
import type { MyAgendaEvent, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { PrismaService } from '../prisma/prisma.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGENDA_WINDOW_DAYS = 7;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Direct Prisma queries rather than reaching into TeamsService/EventsService
  // internals — CLAUDE.md's Events section notes the codebase's established
  // convention is for each module to re-verify/re-derive what it needs rather
  // than importing across modules.
  async getDashboard(userId: string, from?: string, to?: string): Promise<MyDashboardSummary> {
    const range = this.resolveRange(from, to);

    const [adminMemberships, allMemberships, adminGrants, rosterEntries] = await Promise.all([
      this.prisma.clubMembership.findMany({
        where: { userId, role: 'ADMIN' },
        select: { clubId: true },
      }),
      this.prisma.clubMembership.findMany({ where: { userId }, select: { clubId: true } }),
      this.prisma.teamAdmin.findMany({ where: { userId }, select: { teamId: true } }),
      this.prisma.teamPlayer.findMany({
        where: { player: { userId } },
        select: { teamId: true },
      }),
    ]);

    const adminClubIds = adminMemberships.map((m) => m.clubId);
    const memberClubIds = new Set(allMemberships.map((m) => m.clubId));
    const teamIds = Array.from(
      new Set([...adminGrants.map((g) => g.teamId), ...rosterEntries.map((r) => r.teamId)]),
    );

    const [totalPlayers, events] = await Promise.all([
      adminClubIds.length > 0
        ? this.prisma.player.count({ where: { clubId: { in: adminClubIds } } })
        : Promise.resolve(0),
      teamIds.length > 0
        ? this.prisma.event.findMany({
            where: { teamId: { in: teamIds }, startsAt: { gte: range.from, lte: range.to } },
            include: {
              team: {
                include: {
                  clubTeams: {
                    include: { club: true },
                    orderBy: [{ isOwner: 'desc' as const }, { createdAt: 'asc' as const }],
                  },
                },
              },
            },
            orderBy: { startsAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    return {
      totalPlayers,
      upcomingEvents: events.map((event) => this.toAgendaEvent(event, memberClubIds)),
    };
  }

  private resolveRange(from?: string, to?: string): { from: Date; to: Date } {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(fromDate.getTime() + DEFAULT_AGENDA_WINDOW_DAYS * DAY_IN_MS);
    return { from: fromDate, to: toDate };
  }

  private toAgendaEvent(
    event: {
      id: string;
      teamId: string;
      type: EventType;
      startsAt: Date;
      location: string;
      notes: string | null;
      team: { name: string; clubTeams: { club: { id: string; name: string } }[] };
    },
    memberClubIds: Set<string>,
  ): MyAgendaEvent {
    // Prefer the club the caller actually belongs to (see
    // TeamsService.toMyTeamSummary for the same navigation-safety reasoning),
    // falling back to the owner-first-sorted first club defensively.
    const club =
      event.team.clubTeams.find((ct) => memberClubIds.has(ct.club.id))?.club ??
      event.team.clubTeams[0].club;
    return {
      eventId: event.id,
      teamId: event.teamId,
      teamName: event.team.name,
      clubId: club.id,
      clubName: club.name,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      notes: event.notes,
    };
  }
}
