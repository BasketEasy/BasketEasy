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

type UpsertOutcome = 'created' | 'updated' | 'unchanged';

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
        const { matches } = await this.ffbbProvider.getMatchesForEngagement(link.ffbbEngagementRef);
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
    for (const matches of matchesByLink) {
      for (const match of matches) {
        const outcome = await this.upsertMatch(teamId, match);
        if (outcome === 'created') created += 1;
        else if (outcome === 'updated') updated += 1;
        else unchanged += 1;
      }
    }

    return { created, updated, unchanged };
  }

  private async upsertMatch(teamId: string, match: FfbbMatch): Promise<UpsertOutcome> {
    const existing = await this.prisma.event.findUnique({
      where: { teamId_externalId: { teamId, externalId: match.id } },
    });

    const location = match.location ?? 'Lieu non communiqué';
    // FFBB's date_rencontre has no offset; parse it as UTC explicitly
    // rather than relying on the server process's local timezone to
    // interpret an offset-less ISO string.
    const startsAt = new Date(`${match.startsAt}Z`);

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
      existing.timeConfirmed === match.timeConfirmed;
    if (isUnchanged) {
      return 'unchanged';
    }

    await this.prisma.event.update({
      where: { id: existing.id },
      data: {
        startsAt,
        location,
        opponentName: match.opponentLabel,
        timeConfirmed: match.timeConfirmed,
      },
    });
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
