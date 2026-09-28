import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { GuardianInviteLink, PlayerGuardians } from '@basketeasy/types/guardians';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { GuardiansService } from './guardians.service';

// Club admins only, for now: inviting a parent is roster administration, the
// same audience as PlayerInvite. Every call re-verifies the player belongs to
// :clubId inside the service.
@Controller('clubs/:clubId/players/:playerId/guardians')
@UseGuards(JwtAuthGuard, ClubRolesGuard)
@ClubRoles('ADMIN')
export class ClubPlayerGuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
  ): Promise<PlayerGuardians> {
    return this.guardians.listForPlayer(clubId, playerId);
  }

  @Post('invites')
  createInvite(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<GuardianInviteLink> {
    return this.guardians.createInvite(clubId, playerId, user.id);
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelInvite(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    return this.guardians.cancelInvite(clubId, playerId, inviteId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.guardians.removeGuardian(clubId, playerId, userId);
  }
}
