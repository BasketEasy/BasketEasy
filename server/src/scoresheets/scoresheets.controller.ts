import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { EventScoresheet } from '@basketeasy/types/events';
import type { ScoresheetExtraction } from '@basketeasy/types/scoresheet-extraction';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { AllowGuardians } from '../auth/decorators/allow-guardians.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ScoresheetsService } from './scoresheets.service';
import { ConfirmScoresheetExtractionDto } from './dto/confirm-scoresheet-extraction.dto';

@Controller('clubs/:clubId/teams/:teamId/events/:eventId/scoresheet-extraction')
@UseGuards(JwtAuthGuard)
export class ScoresheetsController {
  constructor(private readonly scoresheetsService: ScoresheetsService) {}

  // ClubRolesGuard only — any rostered member may view, same visibility as
  // the underlying scoresheet capture's GET .../scoresheet.
  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  async getExtraction(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Same @Res() null-body workaround as EventsController.getScoresheetStatus
    // — this route legitimately returns null (no upload yet).
    const result = await this.scoresheetsService.getExtraction(clubId, teamId, eventId);
    res.status(HttpStatus.OK).json(result);
  }

  // ClubRolesGuard (narrowed to a rostered member inside the service), not
  // TeamManagerGuard — relaunching a failed read is the same act as the
  // upload it re-runs, and the button sits in the same card as "Renvoyer le
  // fichier", which any rostered member may already use.
  @Post('retry')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  retryExtraction(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventScoresheet> {
    return this.scoresheetsService.retryOcr(clubId, teamId, eventId, user.id);
  }

  // TeamManagerGuard, not ClubRolesGuard — confirming extracted data as
  // ground truth is a manager action, same guard choice as
  // EventsController.setEventConvocations.
  @Patch('confirm')
  @UseGuards(TeamManagerGuard)
  confirmExtraction(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: ConfirmScoresheetExtractionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScoresheetExtraction> {
    return this.scoresheetsService.confirmExtraction(clubId, teamId, eventId, user.id, dto);
  }
}
