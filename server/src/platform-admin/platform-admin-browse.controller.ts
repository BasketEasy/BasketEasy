import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import type {
  AdminClubDetail,
  AdminClubMember,
  AdminClubSummary,
  AdminEventDetail,
  AdminEventSummary,
  AdminPlayerDetail,
  AdminPlayerSummary,
  AdminRosterEntry,
  AdminScoresheetSummary,
  AdminTeamDetail,
  AdminTeamSummary,
  AdminUserDetail,
  AdminUserSummary,
} from '@basketeasy/types/platform-admin-browse';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { CurrentPlatformRole } from '../auth/decorators/current-platform-role.decorator';
import type { AdminSearchResult } from '@basketeasy/types/platform-admin-search';
import { PlatformAdminBrowseService, type PlatformActor } from './platform-admin-browse.service';
import { PlatformAdminSearchService } from './platform-admin-search.service';
import { PlatformAdminStatsService } from './platform-admin-stats.service';
import type { AdminStats } from '@basketeasy/types/platform-admin-stats';
import {
  AdminClubMembersQueryDto,
  AdminClubsQueryDto,
  AdminEventsQueryDto,
  AdminPlayersQueryDto,
  AdminScoresheetsQueryDto,
  AdminSearchQueryDto,
  AdminStatsQueryDto,
  AdminTeamsQueryDto,
  AdminUsersQueryDto,
} from './dto/admin-list-queries.dto';

function actorOf(user: RequestUser, role: PlatformRole): PlatformActor {
  return { id: user.id, email: user.email, role };
}

/**
 * Read-only browsing over the club graph, mounted at /api/admin.
 *
 * Open to both platform roles: what differs between them is not *whether* a
 * record can be read but how its people are rendered, which the service
 * decides from the caller's role. Every read that shows a DATA_OFFICER
 * people's names (a person list, a roster, an event, a search — any role's
 * search) writes ADMIN_PII_LISTED before answering. See
 * docs/superpowers/specs/2026-09-28-backoffice-v2-part1-read-api.md.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformAdminBrowseController {
  constructor(
    private readonly browse: PlatformAdminBrowseService,
    private readonly searchService: PlatformAdminSearchService,
    private readonly statsService: PlatformAdminStatsService,
  ) {}

  /** Aggregates only, so both roles; `clubId` scopes every metric to one club. */
  @Get('stats')
  stats(@Query() query: AdminStatsQueryDto): Promise<AdminStats> {
    return this.statsService.getStats(query.range ?? '30d', query.clubId);
  }

  /** The global search box: an id in any table, or names (per-role rule). */
  @Get('search')
  async search(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminSearchQueryDto,
    @Req() request: Request,
  ): Promise<AdminSearchResult> {
    const result = await this.searchService.search(role, query.q);
    await this.browse.recordListed(
      actorOf(user, role),
      request,
      'search',
      result,
      { q: query.q },
      { always: true },
    );
    return result;
  }

  @Get('clubs')
  listClubs(@Query() query: AdminClubsQueryDto): Promise<PaginatedResult<AdminClubSummary>> {
    return this.browse.listClubs(query);
  }

  @Get('clubs/:clubId')
  getClub(@Param('clubId', ParseUUIDPipe) clubId: string): Promise<AdminClubDetail> {
    return this.browse.getClub(clubId);
  }

  @Get('clubs/:clubId/members')
  async listClubMembers(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Query() query: AdminClubMembersQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedResult<AdminClubMember>> {
    const result = await this.browse.listClubMembers(role, clubId, query);
    await this.browse.recordListed(actorOf(user, role), request, 'club-members', result, {
      clubId,
      ...query,
    });
    return result;
  }

  @Get('teams')
  listTeams(@Query() query: AdminTeamsQueryDto): Promise<PaginatedResult<AdminTeamSummary>> {
    return this.browse.listTeams(query);
  }

  @Get('teams/:teamId')
  async getTeam(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() request: Request,
  ): Promise<AdminTeamDetail> {
    const result = await this.browse.getTeam(role, teamId);
    await this.browse.recordListed(actorOf(user, role), request, 'team', result, { teamId });
    return result;
  }

  @Get('teams/:teamId/roster')
  async getTeamRoster(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Req() request: Request,
  ): Promise<AdminRosterEntry[]> {
    const result = await this.browse.getTeamRoster(role, teamId);
    await this.browse.recordListed(actorOf(user, role), request, 'team-roster', result, {
      teamId,
    });
    return result;
  }

  @Get('users')
  async listUsers(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminUsersQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedResult<AdminUserSummary>> {
    const result = await this.browse.listUsers(role, query);
    // A search (`q`) is recorded for SUPPORT too: an exact-address hit, even
    // redacted, confirms that the address has an account.
    await this.browse.recordListed(
      actorOf(user, role),
      request,
      'users',
      result,
      { ...query },
      { always: !!query.q },
    );
    return result;
  }

  /** Both roles; a DATA_OFFICER's read writes ADMIN_PII_VIEWED. */
  @Get('users/:userId')
  getUser(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: Request,
  ): Promise<AdminUserDetail> {
    return this.browse.getUser({ id: user.id, email: user.email, role }, userId, request);
  }

  @Get('players')
  async listPlayers(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminPlayersQueryDto,
    @Req() request: Request,
  ): Promise<PaginatedResult<AdminPlayerSummary>> {
    const result = await this.browse.listPlayers(role, query);
    await this.browse.recordListed(
      actorOf(user, role),
      request,
      'players',
      result,
      { ...query },
      { always: !!query.q },
    );
    return result;
  }

  /** Both roles; a DATA_OFFICER's read writes ADMIN_PII_VIEWED. */
  @Get('players/:playerId')
  getPlayer(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Req() request: Request,
  ): Promise<AdminPlayerDetail> {
    return this.browse.getPlayer({ id: user.id, email: user.email, role }, playerId, request);
  }

  @Get('events')
  listEvents(@Query() query: AdminEventsQueryDto): Promise<PaginatedResult<AdminEventSummary>> {
    return this.browse.listEvents(query);
  }

  @Get('events/:eventId')
  async getEvent(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
  ): Promise<AdminEventDetail> {
    const result = await this.browse.getEvent(role, eventId);
    await this.browse.recordListed(actorOf(user, role), request, 'event', result, { eventId });
    return result;
  }

  @Get('scoresheets')
  listScoresheets(
    @Query() query: AdminScoresheetsQueryDto,
  ): Promise<PaginatedResult<AdminScoresheetSummary>> {
    return this.browse.listScoresheets(query);
  }
}
