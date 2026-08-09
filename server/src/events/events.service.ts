import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EventRecurrenceRequest, TeamEvent } from '@basketeasy/types/events';
import { PrismaService } from '../prisma/prisma.service';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
// Caps a single recurring create at ~2 years of weekly occurrences, so a
// distant `until` date can't be used to write an unbounded number of rows.
const MAX_RECURRING_OCCURRENCES = 104;

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
    data: {
      startsAt: string;
      location: string;
      notes?: string;
      recurrence?: EventRecurrenceRequest;
    },
  ): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    const occurrences = this.buildOccurrences(data.startsAt, data.recurrence);
    const events = await this.prisma.$transaction(
      occurrences.map((startsAt) =>
        this.prisma.event.create({
          data: { teamId, startsAt, location: data.location, notes: data.notes ?? null },
        }),
      ),
    );
    return events.map((e) => this.toTeamEvent(e));
  }

  // A recurring create is materialized as one independent Event row per
  // week, rather than a stored rule expanded at read time — each occurrence
  // is edited/deleted on its own, with no series link back to the others.
  private buildOccurrences(startsAt: string, recurrence?: EventRecurrenceRequest): Date[] {
    const start = new Date(startsAt);
    if (!recurrence) {
      return [start];
    }

    const until = new Date(recurrence.until);
    if (until < start) {
      throw new BadRequestException(
        'La date de fin de récurrence doit être postérieure à la date de début',
      );
    }

    const occurrences: Date[] = [];
    for (
      let current = start;
      current <= until && occurrences.length < MAX_RECURRING_OCCURRENCES;
      current = new Date(current.getTime() + WEEK_IN_MS)
    ) {
      occurrences.push(current);
    }
    return occurrences;
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
