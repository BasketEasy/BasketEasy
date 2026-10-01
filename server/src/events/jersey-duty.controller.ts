import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JerseyDutyDetail, JerseyRotationOverview } from '@basketeasy/types/jersey-duty';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { AllowGuardians } from '../auth/decorators/allow-guardians.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ActingAsQueryDto } from '../common/dto/acting-as-query.dto';
import { JerseyDutyService } from './jersey-duty.service';
import { AssignJerseyDutyDto } from './dto/assign-jersey-duty.dto';
import { ProposeJerseySwapDto } from './dto/propose-jersey-swap.dto';
import { GetJerseyRotationDto } from './dto/get-jersey-rotation.dto';

// Player-side routes carry @AllowGuardians(): a parent acts for their child
// (`?forPlayerId=`), for jersey duty only: balls and chasubles stay on the
// player-only logistics route. Manager routes (TeamManagerGuard) never do.
@Controller('clubs/:clubId/teams/:teamId/events/:eventId/jersey-duty')
@UseGuards(JwtAuthGuard)
export class JerseyDutyController {
  constructor(private readonly jerseyDuty: JerseyDutyService) {}

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getDetail(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.getDetail(clubId, teamId, eventId, user.id, query.forPlayerId);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  accept(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.accept(clubId, teamId, eventId, {
      userId: user.id,
      forPlayerId: query.forPlayerId,
    });
  }

  @Post('decline')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  decline(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.decline(clubId, teamId, eventId, {
      userId: user.id,
      forPlayerId: query.forPlayerId,
    });
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  proposeSwap(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @Body() dto: ProposeJerseySwapDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.proposeSwap(
      clubId,
      teamId,
      eventId,
      { userId: user.id, forPlayerId: query.forPlayerId },
      dto.teamPlayerId,
    );
  }

  @Delete('swap')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  cancelSwap(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.cancelSwap(clubId, teamId, eventId, {
      userId: user.id,
      forPlayerId: query.forPlayerId,
    });
  }

  @Post('swap/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  acceptSwap(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.acceptSwap(clubId, teamId, eventId, {
      userId: user.id,
      forPlayerId: query.forPlayerId,
    });
  }

  @Post('swap/refuse')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  refuseSwap(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: ActingAsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.refuseSwap(clubId, teamId, eventId, {
      userId: user.id,
      forPlayerId: query.forPlayerId,
    });
  }

  @Put()
  @UseGuards(TeamManagerGuard)
  assign(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: AssignJerseyDutyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.assign(clubId, teamId, eventId, user.id, dto.teamPlayerId);
  }

  @Post('done')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TeamManagerGuard)
  markDone(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.setDone(clubId, teamId, eventId, user.id, true);
  }

  @Delete('done')
  @UseGuards(TeamManagerGuard)
  unmarkDone(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.setDone(clubId, teamId, eventId, user.id, false);
  }

  @Post('void')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TeamManagerGuard)
  voidTurn(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.setVoided(clubId, teamId, eventId, user.id, true);
  }

  @Delete('void')
  @UseGuards(TeamManagerGuard)
  unvoidTurn(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyDutyDetail> {
    return this.jerseyDuty.setVoided(clubId, teamId, eventId, user.id, false);
  }
}

@Controller('clubs/:clubId/teams/:teamId/jersey-rotation')
@UseGuards(JwtAuthGuard)
export class JerseyRotationController {
  constructor(private readonly jerseyDuty: JerseyDutyService) {}

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getOverview(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: GetJerseyRotationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<JerseyRotationOverview> {
    return this.jerseyDuty.getOverview(clubId, teamId, user.id, query.season, query.forPlayerId);
  }
}
