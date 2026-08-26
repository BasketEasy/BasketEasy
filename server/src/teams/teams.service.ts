import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamCategory, Gender, TeamMemberRole } from '@prisma/client';
import type {
  Team,
  TeamClubLink,
  TeamClubSortBy,
  TeamPlayer,
  TeamPlayerSortBy,
  TeamSortBy,
} from '@basketeasy/types/teams';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import type { TeamAdmin, TeamAdminCandidate } from '@basketeasy/types/team-admins';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import type { TeamFfbbLink as TeamFfbbLinkDto } from '@basketeasy/types/ffbb';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/pagination';
import { FFBB_PROVIDER, FfbbProvider } from '../ffbb/ffbb-provider';
import { ListTeamsDto } from './dto/list-teams.dto';
import { ListTeamClubsDto } from './dto/list-team-clubs.dto';
import { ListTeamPlayersDto } from './dto/list-team-players.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

// Exact copy from docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md's
// "Copy reference (FR)" table — the single source both TeamCreateForm and
// TeamFfbbLinkList's add-row render verbatim via ApiError.message, so the
// two entry points can't drift into near-duplicate phrasing.
const FFBB_LINK_BAD_SHAPE_MESSAGE =
  "Ce lien ne correspond pas au format attendu. Copiez l'URL complète depuis la page de l'équipe sur competitions.ffbb.com — un identifiant seul ne suffit pas.";
const FFBB_LINK_UNREACHABLE_MESSAGE =
  "Impossible de vérifier ce lien auprès de la FFBB pour le moment. Vérifiez l'URL ou réessayez plus tard.";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FFBB_PROVIDER) private readonly ffbbProvider: FfbbProvider,
  ) {}

  async createTeam(
    clubId: string,
    data: { name: string; category: TeamCategory; gender: Gender; ffbbTeamUrl?: string },
  ): Promise<Team> {
    const link = data.ffbbTeamUrl ? await this.validateFfbbLink(data.ffbbTeamUrl) : null;

    try {
      const team = await this.prisma.team.create({
        data: {
          name: data.name,
          category: data.category,
          gender: data.gender,
          clubTeams: { create: { clubId, isOwner: true } },
          ...(link
            ? {
                ffbbLinks: {
                  create: {
                    ffbbEngagementRef: link.ref,
                    ffbbEngagementLabel: link.competitionLabel,
                  },
                },
              }
            : {}),
        },
      });
      return this.toTeam(team);
    } catch (err) {
      throw this.toFfbbLinkConflictError(err);
    }
  }

  /** Validates a pasted FFBB team URL: parses its shape, then confirms it actually resolves via a live fetch. Throws a field-bindable error (FfbbLinkErrorCode) on either failure. */
  private async validateFfbbLink(
    ffbbTeamUrl: string,
  ): Promise<{ ref: string; competitionLabel: string | null }> {
    const ref = this.ffbbProvider.parseEngagementRef(ffbbTeamUrl);
    if (!ref) {
      throw new BadRequestException({
        message: FFBB_LINK_BAD_SHAPE_MESSAGE,
        code: 'FFBB_LINK_INVALID',
      });
    }
    try {
      const { competitionLabel } = await this.ffbbProvider.getMatchesForEngagement(ref);
      return { ref, competitionLabel };
    } catch {
      throw new BadRequestException({
        message: FFBB_LINK_UNREACHABLE_MESSAGE,
        code: 'FFBB_LINK_UNREACHABLE',
      });
    }
  }

  private toFfbbLinkConflictError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new ConflictException('Cette compétition FFBB est déjà liée à une autre équipe');
    }
    return err;
  }

  async listFfbbLinks(clubId: string, teamId: string): Promise<TeamFfbbLinkDto[]> {
    await this.assertTeamInClub(clubId, teamId);
    const links = await this.prisma.teamFfbbLink.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((link) => this.toTeamFfbbLink(link));
  }

  async addFfbbLink(clubId: string, teamId: string, ffbbTeamUrl: string): Promise<TeamFfbbLinkDto> {
    await this.assertTeamInClub(clubId, teamId);
    const link = await this.validateFfbbLink(ffbbTeamUrl);

    try {
      const created = await this.prisma.teamFfbbLink.create({
        data: { teamId, ffbbEngagementRef: link.ref, ffbbEngagementLabel: link.competitionLabel },
      });
      return this.toTeamFfbbLink(created);
    } catch (err) {
      throw this.toFfbbLinkConflictError(err);
    }
  }

  async removeFfbbLink(clubId: string, teamId: string, linkId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);

    const link = await this.prisma.teamFfbbLink.findUnique({ where: { id: linkId } });
    if (!link || link.teamId !== teamId) {
      throw new NotFoundException('FFBB link not found on this team');
    }

    await this.prisma.teamFfbbLink.delete({ where: { id: linkId } });
  }

  private toTeamFfbbLink(link: {
    id: string;
    ffbbEngagementLabel: string | null;
  }): TeamFfbbLinkDto {
    return { id: link.id, ffbbEngagementLabel: link.ffbbEngagementLabel };
  }

  async listTeams(clubId: string, query: ListTeamsDto): Promise<PaginatedResult<Team>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.TeamWhereInput = {
      clubTeams: { some: { clubId } },
      ...(query.category ? { category: query.category } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const orderBy = this.teamsOrderBy(query.sortBy, query.sortOrder);

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({ where, orderBy, skip, take }),
      this.prisma.team.count({ where }),
    ]);

    return { items: teams.map((t) => this.toTeam(t)), total, page, pageSize };
  }

  private teamsOrderBy(
    sortBy?: TeamSortBy,
    sortOrder?: SortOrder,
  ): Prisma.TeamOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    switch (sortBy) {
      case 'category':
        return [{ category: order }];
      case 'createdAt':
        return [{ createdAt: order }];
      case 'name':
      default:
        return [{ name: order }];
    }
  }

  async getTeam(clubId: string, teamId: string): Promise<Team> {
    await this.assertTeamInClub(clubId, teamId);
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.toTeam(team);
  }

  async updateTeam(
    clubId: string,
    teamId: string,
    data: { name?: string; category?: TeamCategory; gender?: Gender },
  ): Promise<Team> {
    await this.assertTeamInClub(clubId, teamId);
    const team = await this.prisma.team.update({ where: { id: teamId }, data });
    return this.toTeam(team);
  }

  async deleteTeam(clubId: string, teamId: string): Promise<void> {
    await this.assertTeamOwner(clubId, teamId);
    // ClubTeam and TeamPlayer rows cascade-delete at the DB level.
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  async listTeamClubs(
    clubId: string,
    teamId: string,
    query: ListTeamClubsDto,
  ): Promise<PaginatedResult<TeamClubLink>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.ClubTeamWhereInput = {
      teamId,
      ...(query.search ? { club: { name: { contains: query.search, mode: 'insensitive' } } } : {}),
    };
    const orderBy = this.teamClubsOrderBy(query.sortBy, query.sortOrder);

    const [clubTeams, total] = await Promise.all([
      this.prisma.clubTeam.findMany({ where, include: { club: true }, orderBy, skip, take }),
      this.prisma.clubTeam.count({ where }),
    ]);

    return { items: clubTeams.map((ct) => this.toTeamClubLink(ct)), total, page, pageSize };
  }

  // The owning club always sorts first — a structural fact about who can
  // manage the CTC, not a sortable attribute — regardless of sortBy/sortOrder.
  private teamClubsOrderBy(
    sortBy?: TeamClubSortBy,
    sortOrder?: SortOrder,
  ): Prisma.ClubTeamOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'linkedAt') {
      return [{ isOwner: 'desc' }, { createdAt: order }];
    }
    return [{ isOwner: 'desc' }, { club: { name: order } }];
  }

  async addTeamClub(clubId: string, teamId: string, partnerClubId: string): Promise<TeamClubLink> {
    await this.assertTeamOwner(clubId, teamId);

    const partnerClub = await this.prisma.club.findUnique({ where: { id: partnerClubId } });
    if (!partnerClub) {
      throw new NotFoundException('Club not found');
    }

    try {
      const clubTeam = await this.prisma.clubTeam.create({
        data: { clubId: partnerClubId, teamId, isOwner: false },
        include: { club: true },
      });
      return this.toTeamClubLink(clubTeam);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Ce club est déjà associé à cette équipe');
      }
      throw err;
    }
  }

  async removeTeamClub(clubId: string, teamId: string, partnerClubId: string): Promise<void> {
    await this.assertTeamOwner(clubId, teamId);

    if (partnerClubId === clubId) {
      throw new BadRequestException(
        "Impossible de retirer le club propriétaire ; supprimez l'équipe à la place",
      );
    }

    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId: partnerClubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Club not found on this team');
    }

    await this.prisma.$transaction([
      this.prisma.teamPlayer.deleteMany({
        where: { teamId, player: { clubId: partnerClubId } },
      }),
      this.prisma.clubTeam.delete({
        where: { clubId_teamId: { clubId: partnerClubId, teamId } },
      }),
    ]);
  }

  async listTeamPlayers(
    clubId: string,
    teamId: string,
    query: ListTeamPlayersDto,
  ): Promise<PaginatedResult<TeamPlayer>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.TeamPlayerWhereInput = {
      teamId,
      ...(query.search
        ? {
            player: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const orderBy = this.teamPlayersOrderBy(query.sortBy, query.sortOrder);

    const [teamPlayers, total] = await Promise.all([
      this.prisma.teamPlayer.findMany({ where, include: { player: true }, orderBy, skip, take }),
      this.prisma.teamPlayer.count({ where }),
    ]);

    return { items: teamPlayers.map((tp) => this.toTeamPlayer(tp)), total, page, pageSize };
  }

  private teamPlayersOrderBy(
    sortBy?: TeamPlayerSortBy,
    sortOrder?: SortOrder,
  ): Prisma.TeamPlayerOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'createdAt') {
      return [{ createdAt: order }];
    }
    return [{ player: { lastName: order } }, { player: { firstName: order } }];
  }

  async addTeamPlayer(
    clubId: string,
    teamId: string,
    playerId: string,
    role: TeamMemberRole = 'PLAYER',
  ): Promise<TeamPlayer> {
    await this.assertTeamInClub(clubId, teamId);

    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const playerClubLinked = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId: player.clubId, teamId } },
    });
    if (!playerClubLinked) {
      throw new BadRequestException('Le joueur doit appartenir à un club associé à cette équipe');
    }

    try {
      const teamPlayer = await this.prisma.teamPlayer.create({
        data: { teamId, playerId, role },
        include: { player: true },
      });
      return this.toTeamPlayer(teamPlayer);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException("Ce joueur fait déjà partie de l'effectif");
      }
      throw err;
    }
  }

  async updateTeamPlayerRole(
    clubId: string,
    teamId: string,
    playerId: string,
    role: TeamMemberRole,
  ): Promise<TeamPlayer> {
    await this.assertTeamInClub(clubId, teamId);

    const teamPlayer = await this.prisma.teamPlayer.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!teamPlayer) {
      throw new NotFoundException('Player not found on this team');
    }

    const updated = await this.prisma.teamPlayer.update({
      where: { id: teamPlayer.id },
      data: { role },
      include: { player: true },
    });
    return this.toTeamPlayer(updated);
  }

  async removeTeamPlayer(clubId: string, teamId: string, playerId: string): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);

    const teamPlayer = await this.prisma.teamPlayer.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!teamPlayer) {
      throw new NotFoundException('Player not found on this team');
    }

    await this.prisma.teamPlayer.delete({ where: { id: teamPlayer.id } });
  }

  async listTeamAdmins(clubId: string, teamId: string): Promise<TeamAdmin[]> {
    await this.assertTeamInClub(clubId, teamId);
    const teamAdmins = await this.prisma.teamAdmin.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return teamAdmins.map((ta) => this.toTeamAdmin(ta));
  }

  async listEligibleAdmins(clubId: string, teamId: string): Promise<TeamAdminCandidate[]> {
    await this.assertTeamInClub(clubId, teamId);

    const memberships = await this.prisma.clubMembership.findMany({
      where: { club: { clubTeams: { some: { teamId } } } },
      include: { user: true },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });

    // A user can hold membership in more than one club linked to the same
    // team (CTC), so dedupe by userId before handing back candidates.
    const seen = new Set<string>();
    const candidates: TeamAdminCandidate[] = [];
    for (const membership of memberships) {
      if (seen.has(membership.userId)) continue;
      seen.add(membership.userId);
      candidates.push({
        userId: membership.userId,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
      });
    }
    return candidates;
  }

  async addTeamAdmin(clubId: string, teamId: string, userId: string): Promise<TeamAdmin> {
    await this.assertTeamInClub(clubId, teamId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const membership = await this.prisma.clubMembership.findFirst({
      where: { userId: user.id, club: { clubTeams: { some: { teamId } } } },
    });
    if (!membership) {
      throw new BadRequestException(
        "L'utilisateur doit être membre d'un club associé à cette équipe",
      );
    }

    try {
      const teamAdmin = await this.prisma.teamAdmin.create({
        data: { teamId, userId: user.id },
        include: { user: true },
      });
      return this.toTeamAdmin(teamAdmin);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Cet utilisateur est déjà administrateur de cette équipe');
      }
      throw err;
    }
  }

  async removeTeamAdmin(
    clubId: string,
    teamId: string,
    userId: string,
    requestingUserId: string,
  ): Promise<void> {
    await this.assertTeamInClub(clubId, teamId);

    const teamAdmin = await this.prisma.teamAdmin.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!teamAdmin) {
      throw new NotFoundException('Team admin not found');
    }

    // Only self-removal is blocked here, not "last admin" in general — a
    // club ADMIN (or another TeamAdmin, once there is more than one) can
    // always revoke the last grant, since club ADMINs remain a valid
    // fallback authority for the team either way (see spec: "a team can
    // safely have zero TeamAdmins"). This guard exists purely so the last
    // TeamAdmin doesn't accidentally lock themselves out with no one else
    // around to undo it.
    if (userId === requestingUserId) {
      const adminCount = await this.prisma.teamAdmin.count({ where: { teamId } });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Vous êtes le dernier administrateur de cette équipe : demandez à un administrateur du club de vous retirer.',
        );
      }
    }

    await this.prisma.teamAdmin.delete({ where: { id: teamAdmin.id } });
  }

  async listTeamsForUser(userId: string): Promise<MyTeamSummary[]> {
    const teamInclude = {
      clubTeams: {
        include: { club: true },
        orderBy: [{ isOwner: 'desc' as const }, { createdAt: 'asc' as const }],
      },
    };

    const [adminGrants, rosterEntries, memberships] = await Promise.all([
      this.prisma.teamAdmin.findMany({
        where: { userId },
        include: { team: { include: teamInclude } },
      }),
      this.prisma.teamPlayer.findMany({
        where: { player: { userId } },
        include: { team: { include: teamInclude } },
      }),
      this.prisma.clubMembership.findMany({ where: { userId } }),
    ]);

    const memberClubIds = new Set(memberships.map((m) => m.clubId));
    const summaries = new Map<string, MyTeamSummary>();

    for (const grant of adminGrants) {
      summaries.set(grant.teamId, this.toMyTeamSummary(grant.team, memberClubIds, true, null));
    }

    for (const entry of rosterEntries) {
      const existing = summaries.get(entry.teamId);
      if (existing) {
        existing.rosterRole = entry.role;
      } else {
        summaries.set(
          entry.teamId,
          this.toMyTeamSummary(entry.team, memberClubIds, false, entry.role),
        );
      }
    }

    return Array.from(summaries.values()).sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  private async assertTeamOwner(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
    if (!clubTeam.isOwner) {
      throw new ForbiddenException('Only the owning club can manage this team');
    }
  }

  private toTeam(team: {
    id: string;
    name: string;
    category: TeamCategory;
    gender: Gender;
    createdAt: Date;
  }): Team {
    return {
      id: team.id,
      name: team.name,
      category: team.category,
      gender: team.gender,
      createdAt: team.createdAt.toISOString(),
    };
  }

  private toTeamClubLink(clubTeam: {
    clubId: string;
    isOwner: boolean;
    createdAt: Date;
    club: { name: string };
  }): TeamClubLink {
    return {
      clubId: clubTeam.clubId,
      clubName: clubTeam.club.name,
      isOwner: clubTeam.isOwner,
      linkedAt: clubTeam.createdAt.toISOString(),
    };
  }

  private toTeamPlayer(teamPlayer: {
    id: string;
    teamId: string;
    playerId: string;
    role: TeamMemberRole;
    createdAt: Date;
    player: { firstName: string; lastName: string; clubId: string };
  }): TeamPlayer {
    return {
      id: teamPlayer.id,
      teamId: teamPlayer.teamId,
      playerId: teamPlayer.playerId,
      firstName: teamPlayer.player.firstName,
      lastName: teamPlayer.player.lastName,
      clubId: teamPlayer.player.clubId,
      role: teamPlayer.role,
      createdAt: teamPlayer.createdAt.toISOString(),
    };
  }

  private toTeamAdmin(teamAdmin: {
    userId: string;
    teamId: string;
    createdAt: Date;
    user: { email: string };
  }): TeamAdmin {
    return {
      userId: teamAdmin.userId,
      email: teamAdmin.user.email,
      teamId: teamAdmin.teamId,
      createdAt: teamAdmin.createdAt.toISOString(),
    };
  }

  private toMyTeamSummary(
    team: {
      id: string;
      name: string;
      category: TeamCategory;
      gender: Gender;
      clubTeams: { club: { id: string; name: string } }[];
    },
    memberClubIds: Set<string>,
    isTeamAdmin: boolean,
    rosterRole: TeamMemberRole | null,
  ): MyTeamSummary {
    // The navigation clubId must be one the caller actually belongs to —
    // ClubRolesGuard on GET .../teams/:teamId checks ClubMembership at
    // exactly that :clubId, so linking to a CTC team's owning club when the
    // caller is only a member of the partner club would 403. Every
    // TeamAdmin/TeamPlayer grant surfaced here was only created for a user
    // already in one of the team's linked clubs, so a match always exists in
    // practice; clubTeams is owner-first (see listTeamsForUser), so this
    // still prefers the owning club whenever the caller belongs to it, and
    // falls back to it defensively if no membership match is found at all.
    const club =
      team.clubTeams.find((ct) => memberClubIds.has(ct.club.id))?.club ?? team.clubTeams[0].club;
    return {
      teamId: team.id,
      teamName: team.name,
      category: team.category,
      gender: team.gender,
      clubId: club.id,
      clubName: club.name,
      isTeamAdmin,
      rosterRole,
    };
  }
}
