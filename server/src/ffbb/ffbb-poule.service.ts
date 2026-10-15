import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PouleResults } from '@basketeasy/types/ffbb';
import { PrismaService } from '../prisma/prisma.service';
import { FFBB_PROVIDER, FfbbPageFormatError, FfbbProvider } from './ffbb-provider';

const TRAILING_ENGAGEMENT_ID_PATTERN = /\/equipes\/(\d+)\/?$/;

const POULE_FETCH_FAILED_MESSAGE =
  'Impossible de récupérer les résultats de la poule pour le moment. Réessayez dans quelques minutes.';

/**
 * Reads a team's whole poule (standings + latest results) live from FFBB —
 * never persisted, see docs/decisions/ffbb.md.
 * Its own module rather than a route on TeamsService: same cross-module
 * convention as TeamStatsService/DashboardService/EventsService (queries
 * PrismaService directly), and this reads a distinct external source, not
 * BasketEasy's own tables.
 */
@Injectable()
export class FfbbPouleService {
  private readonly logger = new Logger(FfbbPouleService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FFBB_PROVIDER) private readonly ffbbProvider: FfbbProvider,
  ) {}

  async getPouleResults(clubId: string, teamId: string): Promise<PouleResults> {
    await this.assertTeamInClub(clubId, teamId);

    // A team can hold more than one FFBB link (championship + cup — see
    // docs/decisions/ffbb.md); the most
    // recently added one is treated as the league poule that matters here,
    // since a cup poule's standings aren't meaningful the same way and
    // asking the coach to pick isn't worth building for the rarer case.
    const link = await this.prisma.teamFfbbLink.findFirst({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
    if (!link) {
      throw new NotFoundException('No FFBB link on this team');
    }

    const ourEngagementIdMatch = TRAILING_ENGAGEMENT_ID_PATTERN.exec(link.ffbbEngagementRef);
    if (!ourEngagementIdMatch) {
      // Can't happen through the add-link path (it only ever stores a ref
      // parseEngagementRef already validated), but a stale/hand-edited row
      // shouldn't crash the request — surface the same friendly failure.
      throw new FfbbPageFormatError(
        `Malformed stored FFBB engagement ref: "${link.ffbbEngagementRef}"`,
      );
    }
    const ourEngagementId = ourEngagementIdMatch[1];

    try {
      const { competitionLabel, pouleRef } = await this.ffbbProvider.getMatchesForEngagement(
        link.ffbbEngagementRef,
      );
      if (!pouleRef) {
        throw new FfbbPageFormatError('No poule reference available yet for this engagement');
      }
      const { standings, matchdays } = await this.ffbbProvider.getPouleStandings(
        pouleRef,
        ourEngagementId,
      );
      return { competitionLabel, standings, matchdays };
    } catch (err) {
      if (err instanceof FfbbPageFormatError) {
        // The 404 response tells the coach nothing actionable by design —
        // this is the only place the real scrape failure (wrong FFBB page
        // shape, WAF block, stale ref, …) is ever recorded.
        this.logger.warn(
          `FFBB poule fetch failed for team ${teamId} (engagement ${link.ffbbEngagementRef}): ${err.message}`,
        );
        throw new NotFoundException({
          message: POULE_FETCH_FAILED_MESSAGE,
          code: 'FFBB_POULE_UNAVAILABLE',
        });
      }
      throw err;
    }
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
