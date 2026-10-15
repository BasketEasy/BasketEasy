import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { MyChildProfile, MyPersonas, MyPlayerGuardians } from '@basketeasy/types/guardians';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { MyGuardiansService } from './my-guardians.service';
import { UpdateMyChildDto } from './dto/update-my-child.dto';

// Not club-scoped, same reasoning as MyTeamsController: a parent who is
// nothing else in the club has no :clubId to key these off, and every
// ownership check is on the caller's own link.
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MyGuardiansController {
  constructor(private readonly myGuardians: MyGuardiansService) {}

  @Get('personas')
  getPersonas(@CurrentUser() user: RequestUser): Promise<MyPersonas> {
    return this.myGuardians.getPersonas(user.id);
  }

  @Get('children/:playerId')
  getChild(
    @CurrentUser() user: RequestUser,
    @Param('playerId') playerId: string,
  ): Promise<MyChildProfile> {
    return this.myGuardians.getChild(user.id, playerId);
  }

  @Patch('children/:playerId')
  updateChild(
    @CurrentUser() user: RequestUser,
    @Param('playerId') playerId: string,
    @Body() dto: UpdateMyChildDto,
  ): Promise<MyChildProfile> {
    return this.myGuardians.updateChild(user.id, playerId, dto);
  }

  @Delete('children/:playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  stopFollowing(
    @CurrentUser() user: RequestUser,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    return this.myGuardians.stopFollowing(user.id, playerId);
  }

  @Get('players/:playerId/guardians')
  listMyGuardians(
    @CurrentUser() user: RequestUser,
    @Param('playerId') playerId: string,
  ): Promise<MyPlayerGuardians> {
    return this.myGuardians.listMyGuardians(user.id, playerId);
  }

  @Delete('players/:playerId/guardians/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMyGuardian(
    @CurrentUser() user: RequestUser,
    @Param('playerId') playerId: string,
    @Param('userId') guardianUserId: string,
  ): Promise<void> {
    return this.myGuardians.removeMyGuardian(user.id, playerId, guardianUserId);
  }
}
