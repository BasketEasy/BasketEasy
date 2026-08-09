import { Injectable, NotFoundException } from '@nestjs/common';
import type { TeamEvent } from '@basketeasy/types/events';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(clubId: string, teamId: string): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    const events = await this.prisma.event.findMany({
      where: { teamId },
      orderBy: { startsAt: 'asc' },
    });
    return events.map((e) => this.toTeamEvent(e));
  }

  async createEvent(
    clubId: string,
    teamId: string,
    data: { startsAt: string; location: string; notes?: string },
  ): Promise<TeamEvent> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.create({
      data: {
        teamId,
        startsAt: new Date(data.startsAt),
        location: data.location,
        notes: data.notes ?? null,
      },
    });
    return this.toTeamEvent(event);
  }

  async updateEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    data: { startsAt?: string; location?: string; notes?: string },
  ): Promise<TeamEvent> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    return this.toTeamEvent(event);
  }

  async deleteEvent(clubId: string, teamId: string, eventId: string): Promise<void> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    await this.prisma.event.delete({ where: { id: eventId } });
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  // Re-verifies both that the team belongs to clubId and that the event
  // belongs to that team, so an admin of club A can't mutate an event
  // that lives on a team not linked to their club.
  private async assertEventInTeam(clubId: string, teamId: string, eventId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
  }

  private toTeamEvent(event: {
    id: string;
    teamId: string;
    startsAt: Date;
    location: string;
    notes: string | null;
    createdAt: Date;
  }): TeamEvent {
    return {
      id: event.id,
      teamId: event.teamId,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      notes: event.notes,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
