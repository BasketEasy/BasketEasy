import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FfbbImportResult } from '@basketeasy/types/ffbb';
import { PrismaService } from '../prisma/prisma.service';
import { FFBB_PROVIDER, FfbbMatch, FfbbProvider } from './ffbb-provider';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';

type UpsertOutcome = 'created' | 'updated' | 'unchanged';

const MISSING_LOCATION = 'Lieu non communiqué';

// Events are written here through Prisma directly, bypassing the
// class-validator @MaxLength(120) on Create/UpdateEventDto — so an
// over-long scraped address would import fine and then make the event
// uneditable, since EventEditModal re-sends `location` on every save.
const MAX_LOCATION_LENGTH = 120;

function clampLocation(location: string): string {
  return location.length <= MAX_LOCATION_LENGTH
    ? location
    : `${location.slice(0, MAX_LOCATION_LENGTH - 1).trimEnd()}…`;
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
  ) {}

  async importSchedule(clubId: string, teamId: string): Promise<FfbbImportResult> {
    await this.assertTeamInClub(clubId, teamId);

    const links = await this.prisma.teamFfbbLink.findMany({ where: { teamId } });
    if (links.length === 0) {
      throw new BadRequestException("Cette équipe n'a aucune compétition FFBB liée");
    }

    // Fetch every linked engagement's matches before writing anything: one
    // link's fetch failure aborts the whole import rather than partially
    // importing the others, so the admin never sees a silently half-done
    // sync (see the design spec's Backend section).
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
          { resolveVenues: true },
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
    for (const matches of matchesByLink) {
      for (const match of matches) {
        const outcome = await this.upsertMatch(teamId, match, rescheduledEventIds);
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

    return { created, updated, unchanged };
  }

  private async upsertMatch(
    teamId: string,
    match: FfbbMatch,
    rescheduledEventIds: string[],
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
      : (existing?.location ?? MISSING_LOCATION);
    // FFBB's date_rencontre has no offset; parse it as UTC explicitly
    // rather than relying on the server process's local timezone to
    // interpret an offset-less ISO string.
    const startsAt = new Date(`${match.startsAt}Z`);

    const venue = match.isHome ? 'HOME' : 'AWAY';

    if (!existing) {
      await this.prisma.event.create({
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
      return 'created';
    }

    // No result/score is stored locally (out of scope — see the design
    // spec's Scope section), so once FFBB reports a match as played there's
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
    await this.prisma.event.update({
      where: { id: existing.id },
      data: {
        startsAt,
        location,
        opponentName: match.opponentLabel,
        timeConfirmed: match.timeConfirmed,
        venue,
      },
    });
    if (rescheduled) rescheduledEventIds.push(existing.id);
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
