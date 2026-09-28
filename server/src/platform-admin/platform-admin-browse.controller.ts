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
import { PlatformAdminBrowseService } from './platform-admin-browse.service';
import { PlatformAdminSearchService } from './platform-admin-search.service';
import {
  AdminClubMembersQueryDto,
  AdminClubsQueryDto,
  AdminEventsQueryDto,
  AdminPlayersQueryDto,
  AdminScoresheetsQueryDto,
  AdminSearchQueryDto,
  AdminTeamsQueryDto,
  AdminUsersQueryDto,
} from './dto/admin-list-queries.dto';

/**
 * Read-only browsing over the club graph, mounted at /api/admin.
 *
 * Open to both platform roles: what differs between them is not *whether* a
 * record can be read but how its people are rendered, which the service
 * decides from the caller's role. See
 * docs/superpowers/specs/2026-09-28-backoffice-v2-part1-read-api.md.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformAdminBrowseController {
  constructor(
    private readonly browse: PlatformAdminBrowseService,
    private readonly searchService: PlatformAdminSearchService,
  ) {}

  /** The global search box: an id in any table, or names (per-role rule). */
  @Get('search')
  search(
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminSearchQueryDto,
  ): Promise<AdminSearchResult> {
    return this.searchService.search(role, query.q);
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
  listClubMembers(
    @CurrentPlatformRole() role: PlatformRole,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Query() query: AdminClubMembersQueryDto,
  ): Promise<PaginatedResult<AdminClubMember>> {
    return this.browse.listClubMembers(role, clubId, query);
  }

  @Get('teams')
  listTeams(@Query() query: AdminTeamsQueryDto): Promise<PaginatedResult<AdminTeamSummary>> {
    return this.browse.listTeams(query);
  }

  @Get('teams/:teamId')
  getTeam(
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<AdminTeamDetail> {
    return this.browse.getTeam(role, teamId);
  }

  @Get('teams/:teamId/roster')
  getTeamRoster(
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<AdminRosterEntry[]> {
    return this.browse.getTeamRoster(role, teamId);
  }

  @Get('users')
  listUsers(
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminUsersQueryDto,
  ): Promise<PaginatedResult<AdminUserSummary>> {
    return this.browse.listUsers(role, query);
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
  listPlayers(
    @CurrentPlatformRole() role: PlatformRole,
    @Query() query: AdminPlayersQueryDto,
  ): Promise<PaginatedResult<AdminPlayerSummary>> {
    return this.browse.listPlayers(role, query);
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
  getEvent(
    @CurrentPlatformRole() role: PlatformRole,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<AdminEventDetail> {
    return this.browse.getEvent(role, eventId);
  }

  @Get('scoresheets')
  listScoresheets(
    @Query() query: AdminScoresheetsQueryDto,
  ): Promise<PaginatedResult<AdminScoresheetSummary>> {
    return this.browse.listScoresheets(query);
  }
}
