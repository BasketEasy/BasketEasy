import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Gender } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember, ClubMemberSortBy } from '@basketeasy/types/club-members';
import type {
  ImportPlayersRow,
  ImportPlayersResult,
  Player,
  PlayerSortBy,
} from '@basketeasy/types/players';
import type { PlayerInviteLink, PlayerInviteStatus } from '@basketeasy/types/player-invites';
import {
  PARENTAL_CONSENT_REQUIRED_CODE,
  isMinorBirthDate,
  type ParentalConsent,
} from '@basketeasy/types/parental-consent';
import type { PaginatedResult, SortOrder } from '@basketeasy/types/pagination';
import type { ParentalConsentSource } from '@basketeasy/types/guardians';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/pagination';
import { hashToken } from '../common/token-hash';
import { startParentalConsentRetention } from '../common/parental-consent-retention';
import {
  createClubWithAdmin,
  removeClubMembership,
  toFfbbClubCodeError,
  writeParentalConsent,
} from './club-writes';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { ListPlayersDto } from './dto/list-players.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

// A generated invite link is valid for a week — long enough for a player to
// notice it (text/WhatsApp/email, sent by whatever channel the admin uses;
// there is no transactional-email sending wired up yet), short enough that a
// stale, unused link stops being a standing way into the club.
const PLAYER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createClub(userId: string, data: { name: string; ffbbClubCode?: string }): Promise<Club> {
    return this.toClub(await createClubWithAdmin(this.prisma, userId, data));
  }

  async listClubsForUser(userId: string): Promise<Club[]> {
    const clubs = await this.prisma.club.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
    return clubs.map((club) => this.toClub(club));
  }

  async getClub(clubId: string): Promise<Club> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return this.toClub(club);
  }

  // ffbbClubCode is stored unvalidated — no working lookup exists to
  // confirm a code is real (see docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md).
  async setFfbbLink(clubId: string, ffbbClubCode: string): Promise<Club> {
    await this.assertClubExists(clubId);
    try {
      const club = await this.prisma.club.update({ where: { id: clubId }, data: { ffbbClubCode } });
      return this.toClub(club);
    } catch (err) {
      throw toFfbbClubCodeError(err);
    }
  }

  async removeFfbbLink(clubId: string): Promise<void> {
    await this.assertClubExists(clubId);
    await this.prisma.club.update({ where: { id: clubId }, data: { ffbbClubCode: null } });
  }

  private async assertClubExists(clubId: string): Promise<void> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
  }

  async addMember(clubId: string, email: string): Promise<ClubMember> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account with that email');
    }

    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: user.id, clubId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this club');
    }

    const membership = await this.prisma.clubMembership.create({
      data: { userId: user.id, clubId, role: 'MEMBER' },
    });

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    };
  }

  async listMembers(
    clubId: string,
    query: ListClubMembersDto,
  ): Promise<PaginatedResult<ClubMember>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.ClubMembershipWhereInput = {
      clubId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const orderBy = this.membersOrderBy(query.sortBy, query.sortOrder);

    const [memberships, total] = await Promise.all([
      this.prisma.clubMembership.findMany({ where, include: { user: true }, orderBy, skip, take }),
      this.prisma.clubMembership.count({ where }),
    ]);

    return { items: memberships.map((m) => this.toClubMember(m)), total, page, pageSize };
  }

  private membersOrderBy(
    sortBy?: ClubMemberSortBy,
    sortOrder?: SortOrder,
  ): Prisma.ClubMembershipOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    switch (sortBy) {
      case 'email':
        return [{ user: { email: order } }];
      case 'joinedAt':
        return [{ createdAt: order }];
      case 'name':
      default:
        return [{ user: { lastName: order } }, { user: { firstName: order } }];
    }
  }

  private toClubMember(membership: {
    userId: string;
    role: ClubMember['role'];
    createdAt: Date;
    user: { email: string; firstName: string | null; lastName: string | null };
  }): ClubMember {
    return {
      userId: membership.userId,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    };
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    await this.prisma.$transaction((tx) => removeClubMembership(tx, clubId, userId));
  }

  async listPlayers(clubId: string, query: ListPlayersDto): Promise<PaginatedResult<Player>> {
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.PlayerWhereInput = {
      clubId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = this.playersOrderBy(query.sortBy, query.sortOrder);

    const [players, total] = await Promise.all([
      this.prisma.player.findMany({ where, orderBy, skip, take }),
      this.prisma.player.count({ where }),
    ]);

    // One extra bounded query, and only for the minors actually on this page:
    // an adult can never need a consent record, so there is nothing to look
    // up for the usual case of a senior roster.
    const [consents, guardianCounts] = await Promise.all([
      this.latestConsentGivenAt(
        players.filter((p) => isMinorBirthDate(p.birthDate?.toISOString())).map((p) => p.id),
      ),
      this.guardianCounts(players.map((p) => p.id)),
    ]);

    return {
      items: players.map((p) =>
        this.toPlayer(p, consents.get(p.id) ?? null, guardianCounts.get(p.id) ?? 0),
      ),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Most recent consent attestation per player. A player can hold more than
   * one (they can be removed and re-added, and re-recording consent adds a
   * row rather than editing the old proof), so the newest one is the one that
   * answers "is this covered today".
   */
  private async latestConsentGivenAt(playerIds: string[]): Promise<Map<string, Date>> {
    if (playerIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.parentalConsent.findMany({
      where: { playerId: { in: playerIds } },
      select: { playerId: true, consentGivenAt: true },
      orderBy: { consentGivenAt: 'desc' },
    });
    const latest = new Map<string, Date>();
    for (const row of rows) {
      if (row.playerId && !latest.has(row.playerId)) {
        latest.set(row.playerId, row.consentGivenAt);
      }
    }
    return latest;
  }

  /** Linked parents per player, one groupBy for a whole page. */
  private async guardianCounts(playerIds: string[]): Promise<Map<string, number>> {
    if (playerIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.playerGuardian.groupBy({
      by: ['playerId'],
      where: { playerId: { in: playerIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.playerId, row._count._all]));
  }

  private playersOrderBy(
    sortBy?: PlayerSortBy,
    sortOrder?: SortOrder,
  ): Prisma.PlayerOrderByWithRelationInput[] {
    const order = sortOrder ?? 'asc';
    if (sortBy === 'createdAt') {
      return [{ createdAt: order }];
    }
    return [{ lastName: order }, { firstName: order }];
  }

  async createPlayer(
    clubId: string,
    data: {
      firstName: string;
      lastName: string;
      userId?: string;
      nationalId?: string;
      licenseNumber?: string;
      birthDate?: string;
      gender?: Gender;
      licenseType?: string;
      parentalConsent?: { attestedByName: string };
    },
    attestedByUserId?: string,
  ): Promise<Player> {
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }

    // Required here and nowhere else: this is the one path where a person is
    // looking at one player's details as they add them, which is the whole
    // premise of a staff attestation. Bulk import creates tens of rows from
    // federation data with nobody reading any individual one, so failing an
    // import because row 34 is sixteen would make the feature unusable —
    // those players surface in the roster as "autorisation manquante"
    // instead. See the data-retention design doc.
    const isMinor = isMinorBirthDate(data.birthDate);
    if (isMinor && !data.parentalConsent) {
      throw new BadRequestException({
        message: 'Une autorisation parentale est requise pour un joueur mineur',
        code: PARENTAL_CONSENT_REQUIRED_CODE,
      });
    }

    try {
      const player = await this.prisma.$transaction(async (tx) => {
        const created = await tx.player.create({
          data: {
            clubId,
            firstName: data.firstName,
            lastName: data.lastName,
            userId: data.userId,
            nationalId: data.nationalId,
            licenseNumber: data.licenseNumber,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
            gender: data.gender,
            licenseType: data.licenseType,
          },
        });
        if (isMinor && data.parentalConsent && created.birthDate) {
          await tx.parentalConsent.create({
            data: {
              playerId: created.id,
              clubId,
              playerFirstName: created.firstName,
              playerLastName: created.lastName,
              playerBirthDate: created.birthDate,
              attestedByName: data.parentalConsent.attestedByName,
              attestedByUserId: attestedByUserId ?? null,
            },
          });
        }
        return created;
      });
      return this.toPlayer(player, isMinor ? new Date() : null);
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  /**
   * Records (or re-records) the attestation for a player who already exists —
   * the path for the minors created by bulk import, which is exempt from the
   * check above.
   *
   * Adds a row rather than editing the previous one: a consent proof is
   * evidence, and evidence is not rewritten. Any earlier row for this player
   * has its retention clock cleared, so re-recording consent for a player who
   * had been removed and re-added doesn't leave a proof expiring underneath
   * an active roster entry.
   */
  async recordParentalConsent(
    clubId: string,
    playerId: string,
    attestedByName: string,
    attestedByUserId?: string,
  ): Promise<ParentalConsent> {
    const player = await this.findPlayerInClub(clubId, playerId);
    const birthDate = player.birthDate;
    if (!birthDate) {
      throw new BadRequestException(
        'Renseignez la date de naissance du joueur avant d’enregistrer une autorisation parentale',
      );
    }

    const consent = await this.prisma.$transaction((tx) =>
      writeParentalConsent(
        tx,
        { ...player, birthDate },
        { name: attestedByName, userId: attestedByUserId ?? null },
      ),
    );

    return this.toParentalConsent(consent);
  }

  async updatePlayer(
    clubId: string,
    playerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      userId?: string | null;
      nationalId?: string | null;
      licenseNumber?: string | null;
      birthDate?: string | null;
      gender?: Gender | null;
      licenseType?: string | null;
    },
  ): Promise<Player> {
    await this.findPlayerInClub(clubId, playerId);
    if (data.userId) {
      await this.assertClubMember(clubId, data.userId);
    }
    try {
      const player = await this.prisma.player.update({
        where: { id: playerId },
        data: {
          ...data,
          birthDate:
            data.birthDate === undefined
              ? undefined
              : data.birthDate
                ? new Date(data.birthDate)
                : null,
        },
      });
      // Same "minors only" rule as listPlayers — an adult can never have a
      // consent record to report, so there is nothing to look up.
      const [consents, guardianCounts] = await Promise.all([
        this.latestConsentGivenAt(
          isMinorBirthDate(player.birthDate?.toISOString()) ? [player.id] : [],
        ),
        this.guardianCounts([player.id]),
      ]);
      return this.toPlayer(
        player,
        consents.get(player.id) ?? null,
        guardianCounts.get(player.id) ?? 0,
      );
    } catch (err) {
      throw this.toPlayerLinkError(err);
    }
  }

  async importPlayers(clubId: string, rows: ImportPlayersRow[]): Promise<ImportPlayersResult> {
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let conflicts = 0;

      for (const row of rows) {
        const data = {
          firstName: row.firstName,
          lastName: row.lastName,
          nationalId: row.nationalId ?? null,
          licenseNumber: row.licenseNumber ?? null,
          birthDate: row.birthDate ? new Date(row.birthDate) : null,
          gender: row.gender ?? null,
          licenseType: row.licenseType ?? null,
        };

        const byNationalId = row.nationalId
          ? await tx.player.findUnique({ where: { nationalId: row.nationalId } })
          : null;

        if (byNationalId) {
          if (byNationalId.clubId !== clubId) {
            conflicts++;
            continue;
          }
          await tx.player.update({ where: { id: byNationalId.id }, data });
          updated++;
          continue;
        }

        const byNameAndBirthDate =
          row.birthDate &&
          (await tx.player.findFirst({
            where: {
              clubId,
              firstName: row.firstName,
              lastName: row.lastName,
              birthDate: new Date(row.birthDate),
            },
          }));

        if (byNameAndBirthDate) {
          await tx.player.update({ where: { id: byNameAndBirthDate.id }, data });
          updated++;
          continue;
        }

        await tx.player.create({ data: { ...data, clubId } });
        created++;
      }

      return { created, updated, conflicts };
    });
  }

  private async assertClubMember(clubId: string, userId: string): Promise<void> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new BadRequestException('Le compte lié doit être membre du club');
    }
  }

  private toPlayerLinkError(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new ConflictException('Ce membre est déjà lié à un autre joueur');
    }
    return err;
  }

  async deletePlayer(clubId: string, playerId: string): Promise<void> {
    await this.findPlayerInClub(clubId, playerId);
    await this.prisma.$transaction(async (tx) => {
      // Before the delete, not after: the consent rows are found by playerId,
      // and the FK is SetNull — a record whose clock hadn't started yet would
      // otherwise be left pointing at nothing and never expire.
      await startParentalConsentRetention(tx, [playerId]);
      await tx.player.delete({ where: { id: playerId } });
    });
  }

  // Generates (or regenerates) a one-time invite link for a player with no
  // linked account yet. @@unique on PlayerInvite.playerId means this upserts
  // the same row — a fresh token invalidates whatever link was generated
  // before it, same "regenerate replaces" convention as
  // ScoresheetsService.retryOcr. The raw token is only ever returned here;
  // everywhere else (getPlayerInviteStatus, InvitesService) only sees its hash.
  async createPlayerInvite(clubId: string, playerId: string): Promise<PlayerInviteLink> {
    const player = await this.findPlayerInClub(clubId, playerId);
    if (player.userId) {
      throw new BadRequestException('Ce joueur est déjà lié à un compte');
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PLAYER_INVITE_TTL_MS);
    await this.prisma.playerInvite.upsert({
      where: { playerId },
      create: { playerId, tokenHash: hashToken(rawToken), expiresAt },
      update: { tokenHash: hashToken(rawToken), expiresAt, acceptedAt: null },
    });

    return {
      token: rawToken,
      url: this.buildInviteUrl(rawToken),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getPlayerInviteStatus(clubId: string, playerId: string): Promise<PlayerInviteStatus> {
    await this.findPlayerInClub(clubId, playerId);
    const invite = await this.prisma.playerInvite.findUnique({ where: { playerId } });
    if (!invite) {
      return { status: 'NONE', expiresAt: null };
    }
    if (invite.acceptedAt) {
      return { status: 'ACCEPTED', expiresAt: null };
    }
    if (invite.expiresAt < new Date()) {
      return { status: 'EXPIRED', expiresAt: invite.expiresAt.toISOString() };
    }
    return { status: 'PENDING', expiresAt: invite.expiresAt.toISOString() };
  }

  private buildInviteUrl(token: string): string {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return `${frontendUrl}/invite/${token}`;
  }

  private async findPlayerInClub(
    clubId: string,
    playerId: string,
  ): Promise<{
    id: string;
    clubId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
  }> {
    const existing = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!existing || existing.clubId !== clubId) {
      throw new NotFoundException('Player not found');
    }
    return existing;
  }

  private toPlayer(
    player: {
      id: string;
      clubId: string;
      firstName: string;
      lastName: string;
      userId: string | null;
      nationalId: string | null;
      licenseNumber: string | null;
      birthDate: Date | null;
      gender: Gender | null;
      licenseType: string | null;
      createdAt: Date;
    },
    parentalConsentGivenAt: Date | null = null,
    guardianCount = 0,
  ): Player {
    return {
      id: player.id,
      clubId: player.clubId,
      firstName: player.firstName,
      lastName: player.lastName,
      userId: player.userId,
      nationalId: player.nationalId,
      licenseNumber: player.licenseNumber,
      birthDate: player.birthDate ? player.birthDate.toISOString() : null,
      gender: player.gender,
      licenseType: player.licenseType,
      isMinor: isMinorBirthDate(player.birthDate?.toISOString()),
      parentalConsentGivenAt: parentalConsentGivenAt ? parentalConsentGivenAt.toISOString() : null,
      guardianCount,
      createdAt: player.createdAt.toISOString(),
    };
  }

  private toParentalConsent(consent: {
    id: string;
    playerId: string | null;
    clubId: string | null;
    playerFirstName: string;
    playerLastName: string;
    playerBirthDate: Date;
    attestedByName: string;
    attestedByUserId: string | null;
    source: ParentalConsentSource;
    consentGivenAt: Date;
    retentionExpiresAt: Date | null;
  }): ParentalConsent {
    return {
      id: consent.id,
      playerId: consent.playerId,
      clubId: consent.clubId,
      playerFirstName: consent.playerFirstName,
      playerLastName: consent.playerLastName,
      playerBirthDate: consent.playerBirthDate.toISOString(),
      attestedByName: consent.attestedByName,
      attestedByUserId: consent.attestedByUserId,
      source: consent.source,
      consentGivenAt: consent.consentGivenAt.toISOString(),
      retentionExpiresAt: consent.retentionExpiresAt
        ? consent.retentionExpiresAt.toISOString()
        : null,
    };
  }

  private toClub(club: {
    id: string;
    name: string;
    ffbbClubCode: string | null;
    createdAt: Date;
  }): Club {
    return {
      id: club.id,
      name: club.name,
      ffbbClubCode: club.ffbbClubCode,
      createdAt: club.createdAt.toISOString(),
    };
  }
}
