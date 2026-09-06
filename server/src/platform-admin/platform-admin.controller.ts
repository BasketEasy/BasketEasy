import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AuditLogEntry,
  ErasePlatformUserResponse,
  PlatformLoginResponse,
  PlatformUserDetail,
  PlatformUserExport,
  RedactedUserSummary,
  RetentionRunSummary,
  RetentionStepSummary,
} from '@basketeasy/types/platform-admin';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { ListPlatformUsersDto } from './dto/list-platform-users.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ErasePlatformUserDto } from './dto/erase-platform-user.dto';
import { ExportPlatformUserDto } from './dto/export-platform-user.dto';

const DEFAULT_PAGE_SIZE = 25;
/** Enough history to see the sweep running nightly for a month. */
const RETENTION_RUN_HISTORY_LIMIT = 30;

/**
 * The platform back-office, mounted at /api/admin.
 *
 * Not club-scoped — same reasoning as MyTeamsController and
 * DashboardController, except here there is no club to scope *to*: this is
 * platform-staff authority over the whole deployment.
 *
 * Read-mostly by design, with exactly one destructive action. A back-office
 * over personal data is the single highest-blast-radius surface in the
 * product — it is the one place a compromised credential exposes every
 * club's roster at once rather than one club's own data — so the route list
 * stays at what the job actually needs and no more. See
 * docs/superpowers/specs/2026-09-06-backoffice-design.md.
 */
@Controller('admin')
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  /**
   * The step-up itself, and the only route here behind JwtAuthGuard alone —
   * it is what mints the credential every other route requires.
   */
  @Post('login')
  @UseGuards(JwtAuthGuard)
  login(
    @CurrentUser() user: RequestUser,
    @Body() body: PlatformLoginDto,
    @Req() request: Request,
  ): Promise<PlatformLoginResponse> {
    return this.platformAdmin.login(user.id, user.email, body.totpCode, request);
  }

  /** Both roles: confirming the sweep runs is the SUPPORT job. */
  @Get('retention/runs')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  listRetentionRuns(): Promise<RetentionRunSummary[]> {
    return this.platformAdmin.listRetentionRuns(RETENTION_RUN_HISTORY_LIMIT);
  }

  /**
   * DATA_OFFICER-only despite deleting nothing: a dry run's counts are a
   * headcount of accounts about to be erased, which is closer to the erasure
   * decision than to support work.
   */
  @Post('retention/dry-run')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @PlatformRoles('DATA_OFFICER')
  runRetentionDryRun(): Promise<RetentionStepSummary[]> {
    return this.platformAdmin.runRetentionDryRun();
  }

  /** Redacted, so both roles may read it. */
  @Get('users')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  listUsers(@Query() query: ListPlatformUsersDto): Promise<PaginatedResult<RedactedUserSummary>> {
    return this.platformAdmin.listInactiveSoonUsers(
      query.page ?? 1,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
    );
  }

  @Get('users/:userId')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @PlatformRoles('DATA_OFFICER')
  getUser(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: Request,
  ): Promise<PlatformUserDetail> {
    return this.platformAdmin.getUserDetail(user.id, user.email, userId, request);
  }

  /**
   * RGPD art. 15 / art. 20. A POST, and reason-carrying, because it is a
   * disclosure rather than a read — see the service method.
   */
  @Post('users/:userId/export')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @PlatformRoles('DATA_OFFICER')
  exportUser(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ExportPlatformUserDto,
    @Req() request: Request,
  ): Promise<PlatformUserExport> {
    return this.platformAdmin.exportUser(user.id, user.email, userId, body.reason, request);
  }

  @Post('users/:userId/erase')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @PlatformRoles('DATA_OFFICER')
  eraseUser(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ErasePlatformUserDto,
    @Req() request: Request,
  ): Promise<ErasePlatformUserResponse> {
    return this.platformAdmin.eraseUser(user.id, user.email, userId, body.reason, request);
  }

  @Get('audit-log')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @PlatformRoles('DATA_OFFICER')
  listAuditLog(@Query() query: ListAuditLogDto): Promise<PaginatedResult<AuditLogEntry>> {
    return this.platformAdmin.listAuditLog(
      query.userId,
      query.page ?? 1,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
    );
  }
}
