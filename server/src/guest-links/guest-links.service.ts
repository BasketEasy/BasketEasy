import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventRsvpChangeEntry, TeamGuestLinkInfo } from '@basketeasy/types/guest-links';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toRsvpRespondent } from '../common/rsvp-respondent';

const HISTORY_LIMIT = 50;

/** The manager side of the team's guest link. */
@Injectable()
export class GuestLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async get(clubId: string, teamId: string): Promise<TeamGuestLinkInfo> {
    await this.assertTeamInClub(clubId, teamId);
    const link = await this.prisma.teamGuestLink.findUnique({ where: { teamId } });
    return link ? this.toInfo(link.token) : null;
  }

  // Idempotent: a second « activer » returns the live link untouched and
  // writes no audit row, since nothing was granted.
  async enable(clubId: string, teamId: string, userId: string): Promise<{ url: string }> {
    await this.assertTeamInClub(clubId, teamId);
    const existing = await this.prisma.teamGuestLink.findUnique({ where: { teamId } });
    if (existing) return this.toInfo(existing.token);

    const created = await this.prisma.teamGuestLink.upsert({
      where: { teamId },
      create: { teamId, token: newToken(), createdByUserId: userId },
      update: {},
    });
    this.audit.record({
      type: 'GUEST_LINK_ENABLED',
      userId,
      metadata: { teamId },
    });
    return this.toInfo(created.token);
  }

  async regenerate(clubId: string, teamId: string, userId: string): Promise<{ url: string }> {
    await this.assertTeamInClub(clubId, teamId);
    const existing = await this.prisma.teamGuestLink.findUnique({ where: { teamId } });
    if (!existing) throw new NotFoundException("Le lien n'est pas activé");

    const updated = await this.prisma.teamGuestLink.update({
      where: { teamId },
      data: { token: newToken(), createdByUserId: userId, createdAt: new Date() },
    });
    this.audit.record({ type: 'GUEST_LINK_REGENERATED', userId, metadata: { teamId } });
    return this.toInfo(updated.token);
  }

  // The row is deleted, so a later enable issues a new token: a link switched
  // off because it leaked must not come back by switching it on again.
  async disable(clubId: string, teamId: string, userId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);
    const { count } = await this.prisma.teamGuestLink.deleteMany({ where: { teamId } });
    if (count > 0) {
      this.audit.record({ type: 'GUEST_LINK_DISABLED', userId, metadata: { teamId } });
    }
  }

  async history(
    clubId: string,
    teamId: string,
    eventId: string,
    teamPlayerId: string,
    callerId: string,
  ): Promise<EventRsvpChangeEntry[]> {
    await this.assertTeamInClub(clubId, teamId);
    const [event, teamPlayer] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId }, select: { teamId: true } }),
      this.prisma.teamPlayer.findUnique({ where: { id: teamPlayerId }, select: { teamId: true } }),
    ]);
    if (event?.teamId !== teamId || teamPlayer?.teamId !== teamId) {
      throw new NotFoundException();
    }
    const rows = await this.prisma.eventRsvpChange.findMany({
      where: { eventId, teamPlayerId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: { respondedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((row) => ({
      status: row.status,
      travelMode: row.travelMode,
      source: row.source,
      via: row.via,
      respondedBy: toRsvpRespondent(row.respondedBy, callerId),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // Same defense-in-depth as TeamsService/EventsService: the team must belong
  // to the route's club before any read or write.
  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const link = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
      select: { teamId: true },
    });
    if (!link) throw new NotFoundException('Équipe introuvable');
  }

  // Resolved per call from FRONTEND_URL, as MailService.absoluteUrl does, so a
  // new hostname doesn't invalidate the stored token.
  private toInfo(token: string): { url: string } {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return { url: `${frontendUrl.replace(/\/+$/, '')}/r/${token}` };
  }
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}
