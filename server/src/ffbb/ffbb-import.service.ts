import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FFBB_MISSING_VENUE_LIST_LIMIT, type FfbbImportResult } from '@basketeasy/types/ffbb';
import { EVENT_LOCATION_MAX_LENGTH, UNKNOWN_EVENT_LOCATION } from '@basketeasy/types/events';
import { PrismaService } from '../prisma/prisma.service';
import { parisWallClockToDate } from '../common/paris-time';
import { FFBB_PROVIDER, FfbbMatch, FfbbProvider } from './ffbb-provider';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { WhatsAppReminderService } from '../whatsapp-reminders/whatsapp-reminder.service';

type UpsertOutcome = 'created' | 'updated' | 'unchanged';

// Events are written here through Prisma directly, bypassing the
// class-validator @MaxLength(120) on Create/UpdateEventDto — so an
// over-long scraped address would import fine and then make the event
// uneditable, since EventEditModal re-sends `location` on every save.
function clampLocation(location: string): string {
  return location.length <= EVENT_LOCATION_MAX_LENGTH
    ? location
    : `${location.slice(0, EVENT_LOCATION_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Pulls every match for every one of a team's linked FFBB engagements and
 * upserts one MATCH Event per match, idempotently. Queries PrismaService
 * directly rather than injecting TeamsService/EventsService — same
 * cross-module convention DashboardService and EventsService already use
 * (see CLAUDE.md's Dashboard/Events module sections).
 */
@Injectable()
export class FfbbImportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FFBB_PROVIDER) private readonly ffbbProvider: FfbbProvider,
    private readonly meetingPoints: MeetingPointsService,
    private readonly whatsAppReminders: WhatsAppReminderService,
  ) {}

  async importSchedule(clubId: string, teamId: string): Promise<FfbbImportResult> {
    await this.assertTeamInClub(clubId, teamId);

    const links = await this.prisma.teamFfbbLink.findMany({ where: { teamId } });
    if (links.length === 0) {
      throw new BadRequestException("Cette équipe n'a aucune compétition FFBB liée");
    }

    // Matches whose venue an earlier import already found: the provider reads
    // the others' detail pages first, since its budget can't cover a season.
    const withVenue = await this.prisma.event.findMany({
      where: {
        teamId,
        externalId: { not: null },
        location: { not: UNKNOWN_EVENT_LOCATION },
      },
      select: { externalId: true },
    });
    const knownVenueMatchIds = new Set(withVenue.map((e) => e.externalId as string));

    // Fetch every linked engagement's matches before writing anything: one
    // link's fetch failure aborts the whole import rather than partially
    // importing the others, so the admin never sees a silently half-done
    // sync (see docs/decisions/ffbb.md).
    const matchesByLink: FfbbMatch[][] = [];
    for (const link of links) {
      try {
        // resolveVenues: the venue lives on each match's own FFBB detail
        // page, not on the fixture list — an import is the one caller that
        // pays for those extra page loads (link validation doesn't need
        // them). Best-effort by contract: a match whose venue can't be
        // resolved comes back with location null and still imports.
        const { matches } = await this.ffbbProvider.getMatchesForEngagement(
          link.ffbbEngagementRef,
          { resolveVenues: true, knownVenueMatchIds },
        );
        matchesByLink.push(matches);
      } catch {
        const untouched =
          links.length > 1
            ? "Les autres compétitions liées n'ont pas été touchées"
            : "Rien n'a été touché";
        throw new BadGatewayException(
          `Impossible de récupérer les matchs pour « ${link.ffbbEngagementLabel ?? 'cette compétition'} ». ${untouched} — réessayez plus tard.`,
        );
      }
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const rescheduledEventIds: string[] = [];
    // Every created or changed match: this import is a second write path for
    // Event rows, so it reconciles the WhatsApp reminders itself.
    const touchedEventIds: string[] = [];
    const changedEventIds: string[] = [];
    for (const matches of matchesByLink) {
      for (const match of matches) {
        const outcome = await this.upsertMatch(
          teamId,
          match,
          rescheduledEventIds,
          touchedEventIds,
          changedEventIds,
        );
        if (outcome === 'created') created += 1;
        else if (outcome === 'updated') updated += 1;
        else unchanged += 1;
      }
    }
    // A kick-off FFBB moved moves the meeting time with it — announced once
    // for the whole import, not per match.
    if (rescheduledEventIds.length > 0) {
      // Same rule as EventsService.updateEvent: a meeting-time override was
      // set against the old kick-off.
      await this.prisma.eventMeeting.updateMany({
        where: { eventId: { in: rescheduledEventIds } },
        data: { meetsAtOverride: null },
      });
      await this.meetingPoints.announceMeetingChanges(rescheduledEventIds);
    }

    await this.whatsAppReminders.syncEvents(touchedEventIds);
    // Only matches FFBB changed can have made a shared message stale.
    await this.whatsAppReminders.onEventsChanged(changedEventIds);

    const { missingVenue, missingVenueTotal } = await this.findMissingVenues(teamId);
    return { created, updated, unchanged, missingVenue, missingVenueTotal };
  }

  // Read after the upserts rather than collected during them: upsertMatch
  // returns early for a played match and never sees one whose FFBB link was
  // removed, and both can still be upcoming rows with no venue.
  private async findMissingVenues(
    teamId: string,
  ): Promise<Pick<FfbbImportResult, 'missingVenue' | 'missingVenueTotal'>> {
    const where = {
      teamId,
      type: 'MATCH' as const,
      externalId: { not: null },
      location: UNKNOWN_EVENT_LOCATION,
      startsAt: { gt: new Date() },
    };
    const [rows, missingVenueTotal] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        take: FFBB_MISSING_VENUE_LIST_LIMIT,
        select: { id: true, opponentName: true, startsAt: true },
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      missingVenue: rows.map((row) => ({
        eventId: row.id,
        opponentName: row.opponentName,
        startsAt: row.startsAt.toISOString(),
      })),
      missingVenueTotal,
    };
  }

  private async upsertMatch(
    teamId: string,
    match: FfbbMatch,
    rescheduledEventIds: string[],
    touchedEventIds: string[],
    changedEventIds: string[],
  ): Promise<UpsertOutcome> {
    const existing = await this.prisma.event.findUnique({
      where: { teamId_externalId: { teamId, externalId: match.id } },
    });

    // Venue resolution is best-effort by design (a detail page can time out
    // or not publish one yet), so a null never overwrites an address a
    // previous import already found — otherwise one flaky re-sync would
    // silently wipe every venue back to the placeholder.
    const location = match.location
      ? clampLocation(match.location)
      : (existing?.location ?? UNKNOWN_EVENT_LOCATION);
    // FFBB's date_rencontre has no offset and is a Paris wall-clock time.
    // Resolve it against Europe/Paris explicitly, never UTC and never the
    // server process's local timezone.
    const startsAt = parisWallClockToDate(match.startsAt);

    const venue = match.isHome ? 'HOME' : 'AWAY';

    if (!existing) {
      const createdEvent = await this.prisma.event.create({
        data: {
          teamId,
          type: 'MATCH',
          startsAt,
          location,
          opponentName: match.opponentLabel,
          externalId: match.id,
          timeConfirmed: match.timeConfirmed,
          venue,
        },
      });
      touchedEventIds.push(createdEvent.id);
      return 'created';
    }

    // No result/score is stored locally (out of scope — see
    // docs/decisions/ffbb.md), so once FFBB reports a match as played there's
    // nothing left to sync; re-touching it on a later re-sync risks
    // clobbering fields with stale placeholder data instead.
    if (match.played) {
      return 'unchanged';
    }

    const isUnchanged =
      existing.startsAt.getTime() === startsAt.getTime() &&
      existing.location === location &&
      existing.opponentName === match.opponentLabel &&
      existing.timeConfirmed === match.timeConfirmed &&
      existing.venue === venue;
    if (isUnchanged) {
      return 'unchanged';
    }

    const rescheduled = existing.startsAt.getTime() !== startsAt.getTime();
    // The jersey wash duty (EventJerseyDuty) is deliberately untouched here: a
    // moved kickoff simply moves the lock and the « counts as a turn » moment
    // with it, and the freeze job only ever reads the current `startsAt`.
    await this.prisma.event.update({
      where: { id: existing.id },
      data: {
        startsAt,
        location,
        // Every import is a write: an FFBB venue replaces a manager's, and
        // the gym name they typed described the old address, so it goes too.
        // `isUnchanged` compares `location` only: a name on an unchanged
        // address is not an FFBB change.
        locationName: location !== existing.location ? null : undefined,
        opponentName: match.opponentLabel,
        timeConfirmed: match.timeConfirmed,
        venue,
      },
    });
    if (rescheduled) rescheduledEventIds.push(existing.id);
    touchedEventIds.push(existing.id);
    changedEventIds.push(existing.id);
    return 'updated';
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }
}
