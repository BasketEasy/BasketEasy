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
import type { Request } from 'express';
import type { StartImpersonationResponse } from '@basketeasy/types/platform-admin-impersonation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { PlatformAdminImpersonationService } from './platform-admin-impersonation.service';
import { StartImpersonationDto } from './dto/start-impersonation.dto';

/**
 * Read-only impersonation, DATA_OFFICER only: a disclosure of the subject's
 * whole product view, like export.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@PlatformRoles('DATA_OFFICER')
export class PlatformAdminImpersonationController {
  constructor(private readonly impersonation: PlatformAdminImpersonationService) {}

  @Post('users/:userId/impersonate')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: StartImpersonationDto,
    @Req() request: Request,
  ): Promise<StartImpersonationResponse> {
    return this.impersonation.start(
      { userId: user.id, email: user.email },
      userId,
      body.reason,
      request,
    );
  }
}

/**
 * « Quitter », behind the admin's ordinary session only. The step-up token
 * is minted before a session starts and so expires first; behind
 * PlatformAdminGuard, « Quitter » in that gap answered 403 while the session
 * stayed live and no EXITED row was written. Ending can only reduce access,
 * and the service matches the session to its actor, so the ordinary session
 * is enough. An impersonation token never reaches here: its strategy
 * refuses every non-GET.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class PlatformAdminImpersonationEndController {
  constructor(private readonly impersonation: PlatformAdminImpersonationService) {}

  @Post('impersonations/:sessionId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  end(
    @CurrentUser() user: RequestUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.impersonation.end({ userId: user.id, email: user.email }, sessionId, request);
  }
}
