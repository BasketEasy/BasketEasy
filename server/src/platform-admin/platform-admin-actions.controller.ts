import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import type {
  AdminActionResult,
  AdminCreateClubResult,
} from '@basketeasy/types/platform-admin-actions';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { CurrentPlatformRole } from '../auth/decorators/current-platform-role.decorator';
import { PlatformAdminActionsService } from './platform-admin-actions.service';
import type { PlatformActor } from './platform-admin-browse.service';
import {
  AddTeamAdminDto,
  AdminCreateClubDto,
  ChangeClubRoleDto,
  ReasonDto,
  RecordConsentDto,
  TransferTeamOwnershipDto,
} from './dto/admin-actions.dto';

/**
 * The back-office's support actions, mounted at /api/admin. Open to both
 * platform roles; every route takes a reason and writes one
 * ADMIN_SUPPORT_ACTION audit row with the change. Named routes only: nothing
 * here edits arbitrary fields.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformAdminActionsController {
  constructor(private readonly actions: PlatformAdminActionsService) {}

  @Post('users/:userId/resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.resendVerification(actor(user, role), userId, body.reason, request);
  }

  @Post('users/:userId/mark-verified')
  @HttpCode(HttpStatus.OK)
  markVerified(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.markEmailVerified(actor(user, role), userId, body.reason, request);
  }

  @Post('users/:userId/send-password-reset')
  @HttpCode(HttpStatus.OK)
  sendPasswordReset(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.sendPasswordReset(actor(user, role), userId, body.reason, request);
  }

  @Post('users/:userId/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  revokeSessions(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.revokeSessions(actor(user, role), userId, body.reason, request);
  }

  @Post('clubs')
  @HttpCode(HttpStatus.CREATED)
  createClub(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Body() body: AdminCreateClubDto,
    @Req() request: Request,
  ): Promise<AdminCreateClubResult> {
    return this.actions.createClub(
      actor(user, role),
      { name: body.name, ffbbClubCode: body.ffbbClubCode, firstAdminUserId: body.firstAdminUserId },
      body.reason,
      request,
    );
  }

  @Post('clubs/:clubId/members/:userId/role')
  @HttpCode(HttpStatus.OK)
  changeClubRole(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeClubRoleDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.changeClubRole(
      actor(user, role),
      clubId,
      userId,
      body.role,
      body.reason,
      request,
    );
  }

  @Post('clubs/:clubId/members/:userId/remove')
  @HttpCode(HttpStatus.OK)
  removeMembership(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.removeMembership(actor(user, role), clubId, userId, body.reason, request);
  }

  @Post('teams/:teamId/admins')
  @HttpCode(HttpStatus.OK)
  addTeamAdmin(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() body: AddTeamAdminDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.addTeamAdmin(actor(user, role), teamId, body.userId, body.reason, request);
  }

  @Post('teams/:teamId/admins/:userId/remove')
  @HttpCode(HttpStatus.OK)
  removeTeamAdmin(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.removeTeamAdmin(actor(user, role), teamId, userId, body.reason, request);
  }

  @Post('teams/:teamId/owner')
  @HttpCode(HttpStatus.OK)
  transferOwnership(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() body: TransferTeamOwnershipDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.transferTeamOwnership(
      actor(user, role),
      teamId,
      body.clubId,
      body.reason,
      request,
    );
  }

  @Post('scoresheets/:scoresheetId/retry')
  @HttpCode(HttpStatus.OK)
  retryOcr(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('scoresheetId', ParseUUIDPipe) scoresheetId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.retryOcr(actor(user, role), scoresheetId, body.reason, request);
  }

  @Post('players/:playerId/guardian-invites/:inviteId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelGuardianInvite(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.cancelGuardianInvite(
      actor(user, role),
      playerId,
      inviteId,
      body.reason,
      request,
    );
  }

  @Post('players/:playerId/guardians/:userId/remove')
  @HttpCode(HttpStatus.OK)
  removeGuardian(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.removeGuardian(actor(user, role), playerId, userId, body.reason, request);
  }

  @Post('players/:playerId/parental-consent')
  @HttpCode(HttpStatus.OK)
  recordParentalConsent(
    @CurrentUser() user: RequestUser,
    @CurrentPlatformRole() role: PlatformRole,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: RecordConsentDto,
    @Req() request: Request,
  ): Promise<AdminActionResult> {
    return this.actions.recordParentalConsent(
      actor(user, role),
      playerId,
      body.givenBy,
      body.method,
      body.reason,
      request,
    );
  }
}

function actor(user: RequestUser, role: PlatformRole): PlatformActor {
  return { id: user.id, email: user.email, role };
}
