import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { Player } from '@basketeasy/types/players';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { AddClubMemberDto } from './dto/add-club-member.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { ListPlayersDto } from './dto/list-players.dto';
import { LinkFfbbClubDto } from './dto/link-ffbb-club.dto';

@Controller('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  createClub(@CurrentUser() user: RequestUser, @Body() dto: CreateClubDto): Promise<Club> {
    return this.clubsService.createClub(user.id, dto);
  }

  @Get()
  listClubs(@CurrentUser() user: RequestUser): Promise<Club[]> {
    return this.clubsService.listClubsForUser(user.id);
  }

  @Get(':clubId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getClub(@Param('clubId') clubId: string): Promise<Club> {
    return this.clubsService.getClub(clubId);
  }

  @Patch(':clubId/ffbb-link')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  setFfbbLink(@Param('clubId') clubId: string, @Body() dto: LinkFfbbClubDto): Promise<Club> {
    return this.clubsService.setFfbbLink(clubId, dto.ffbbClubCode);
  }

  @Delete(':clubId/ffbb-link')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFfbbLink(@Param('clubId') clubId: string): Promise<void> {
    return this.clubsService.removeFfbbLink(clubId);
  }

  @Post(':clubId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addMember(@Param('clubId') clubId: string, @Body() dto: AddClubMemberDto): Promise<ClubMember> {
    return this.clubsService.addMember(clubId, dto.email);
  }

  @Get(':clubId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  listMembers(
    @Param('clubId') clubId: string,
    @Query() query: ListClubMembersDto,
  ): Promise<PaginatedResult<ClubMember>> {
    return this.clubsService.listMembers(clubId, query);
  }

  @Delete(':clubId/members/:userId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param('clubId') clubId: string, @Param('userId') userId: string): Promise<void> {
    return this.clubsService.removeMember(clubId, userId);
  }

  @Post(':clubId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createPlayer(@Param('clubId') clubId: string, @Body() dto: CreatePlayerDto): Promise<Player> {
    return this.clubsService.createPlayer(clubId, dto);
  }

  @Get(':clubId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  listPlayers(
    @Param('clubId') clubId: string,
    @Query() query: ListPlayersDto,
  ): Promise<PaginatedResult<Player>> {
    return this.clubsService.listPlayers(clubId, query);
  }

  @Patch(':clubId/players/:playerId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  updatePlayer(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerDto,
  ): Promise<Player> {
    return this.clubsService.updatePlayer(clubId, playerId, dto);
  }

  @Delete(':clubId/players/:playerId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlayer(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    return this.clubsService.deletePlayer(clubId, playerId);
  }
}
