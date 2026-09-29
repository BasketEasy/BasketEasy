import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import {
  GUARDIAN_INVITE_REFUSED_CODE,
  MAX_GUARDIANS_PER_PLAYER,
  MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER,
  type AcceptedGuardianInvite,
  type GuardianInviteLink,
  type GuardianInvitePreview,
  type PlayerGuardians,
} from '@basketeasy/types/guardians';
import { INVITE_ALREADY_ACCEPTED_CODE } from '@basketeasy/types/player-invites';
import {
  PARENTAL_CONSENT_REQUIRED_CODE,
  isMinorBirthDate,
} from '@basketeasy/types/parental-consent';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AccountSecurityService } from '../auth/account-security.service';
import { AuditService, type AuditRequestContext } from '../audit/audit.service';
import { hashToken } from '../common/token-hash';

// Same week as PlayerInvite: long enough for a parent to notice a message,
// short enough that an unused link stops being a standing way to a child.
const GUARDIAN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TOO_MANY_GUARDIANS = `Ce joueur a déjà ${MAX_GUARDIANS_PER_PLAYER} parents liés`;

type InviteWithPlayer = Prisma.GuardianInviteGetPayload<{
  include: { player: { include: { club: true } } };
}>;

/**
 * Guardian links from the admin's and the invitee's side: generating and
 * cancelling invite links, listing and removing a player's guardians, and
 * accepting an invite either by creating an account or as the logged-in user.
 * The « me » side (personas, a parent's children, a player's own guardians)
 * lives in MyGuardiansService.
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly accountSecurity: AccountSecurityService,
    private readonly audit: AuditService,
  ) {}

  // ── Admin ─────────────────────────────────────────────────────────────────

  async listForPlayer(clubId: string, playerId: string): Promise<PlayerGuardians> {
    await this.findPlayerInClub(clubId, playerId);
    const now = new Date();
    const [links, invites] = await Promise.all([
      this.prisma.playerGuardian.findMany({
        where: { playerId },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guardianInvite.findMany({
        where: { playerId, acceptedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // One read for every guardian's own in-app consent, newest first so the
    // first hit per guardian is the one that answers "did they consent".
    const consents =
      links.length > 0
        ? await this.prisma.parentalConsent.findMany({
            where: {
              playerId,
              source: 'GUARDIAN_IN_APP',
              attestedByUserId: { in: links.map((l) => l.userId) },
            },
            select: { attestedByUserId: true, consentGivenAt: true },
            orderBy: { consentGivenAt: 'desc' },
          })
        : [];
    const consentByUserId = new Map<string, Date>();
    for (const consent of consents) {
      if (consent.attestedByUserId && !consentByUserId.has(consent.attestedByUserId)) {
        consentByUserId.set(consent.attestedByUserId, consent.consentGivenAt);
      }
    }

    return {
      guardians: links.map((link) => ({
        userId: link.userId,
        firstName: link.user.firstName,
        lastName: link.user.lastName,
        email: link.user.email,
        linkedAt: link.createdAt.toISOString(),
        consentGivenAt: consentByUserId.get(link.userId)?.toISOString() ?? null,
      })),
      pendingInvites: invites.map((invite) => ({
        id: invite.id,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
      })),
    };
  }

  // One link per parent, several live at once (unlike PlayerInvite, which
  // regenerates in place): two parents answering from two phones is the
  // normal case. The raw token is only ever returned here.
  async createInvite(
    clubId: string,
    playerId: string,
    createdByUserId: string,
  ): Promise<GuardianInviteLink> {
    const player = await this.findPlayerInClub(clubId, playerId);
    // A parent follows a minor, or a player whose age the club never recorded.
    // An adult decides for themself who follows them (decision 13), and an
    // adult with no account couldn't remove a parent the club linked.
    if (isAdultBirthDate(player.birthDate)) {
      throw new BadRequestException(
        'Ce joueur est majeur : il n’est pas possible d’inviter un parent',
      );
    }
    const [guardianCount, pendingCount] = await Promise.all([
      this.prisma.playerGuardian.count({ where: { playerId } }),
      this.prisma.guardianInvite.count({
        where: { playerId, acceptedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    if (guardianCount >= MAX_GUARDIANS_PER_PLAYER) {
      throw new BadRequestException(TOO_MANY_GUARDIANS);
    }
    if (pendingCount >= MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER) {
      throw new BadRequestException(
        `${MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER} invitations sont déjà en attente pour ce joueur`,
      );
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + GUARDIAN_INVITE_TTL_MS);
    const invite = await this.prisma.guardianInvite.create({
      data: { playerId, tokenHash: hashToken(rawToken), expiresAt, createdByUserId },
    });

    return {
      id: invite.id,
      token: rawToken,
      url: this.buildInviteUrl(rawToken),
      expiresAt: expiresAt.toISOString(),
    };
  }

  // Deleted rather than flagged: a cancelled link is simply unknown afterwards,
  // the same answer an expired one gets.
  async cancelInvite(clubId: string, playerId: string, inviteId: string): Promise<void> {
    await this.findPlayerInClub(clubId, playerId);
    const { count } = await this.prisma.guardianInvite.deleteMany({
      where: { id: inviteId, playerId, acceptedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Invitation introuvable');
    }
  }

  async removeGuardian(clubId: string, playerId: string, userId: string): Promise<void> {
    await this.findPlayerInClub(clubId, playerId);
    const { count } = await this.prisma.playerGuardian.deleteMany({ where: { playerId, userId } });
    if (count === 0) {
      throw new NotFoundException('Ce parent n’est pas lié à ce joueur');
    }
  }

  // ── Public: accepting an invite ───────────────────────────────────────────

  async getPreview(token: string): Promise<GuardianInvitePreview> {
    const invite = await this.findLiveInvite(token);
    const teams = await this.prisma.teamPlayer.findMany({
      where: { playerId: invite.playerId },
      select: { team: { select: { name: true } } },
      orderBy: { team: { name: 'asc' } },
    });
    return {
      playerFirstName: invite.player.firstName,
      playerLastName: invite.player.lastName,
      clubName: invite.player.club.name,
      teamNames: teams.map((t) => t.team.name),
      requiresConsent: requiresConsent(invite.player.birthDate),
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /**
   * Creates the parent's account, then links it. The invite and the consent
   * rule are checked *before* registering, so a missing consent never leaves
   * an orphan account behind; the transaction re-checks both, and only a race
   * between the two can still fail after registration — the same accepted
   * cost as InvitesService.accept.
   */
  async acceptWithRegistration(
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      consent?: boolean;
    },
    context?: AuditRequestContext,
  ): Promise<AccessTokenResponse & { refreshToken: string }> {
    const invite = await this.findLiveInvite(token);
    assertConsent(invite.player.birthDate, data.consent);

    const { accessToken, refreshToken, user } = await this.authService.register(
      data.email,
      data.password,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { firstName: data.firstName, lastName: data.lastName },
    });
    await this.linkFromInvite(invite, user.id, data.consent, context);

    // Same fire-and-forget verification link a plain registration gets.
    void this.accountSecurity.sendVerificationEmail(user.id);

    return { accessToken, refreshToken, user: await this.authService.me(user.id) };
  }

  async acceptAsUser(
    token: string,
    userId: string,
    consent: boolean | undefined,
    context?: AuditRequestContext,
  ): Promise<AcceptedGuardianInvite> {
    const invite = await this.findInvite(token);
    // Accepting twice from the same account is not an error: the second tap
    // on a link the parent already used just lands them where the first did.
    if (invite.acceptedByUserId !== userId) {
      this.assertLive(invite);
    }
    await this.linkFromInvite(invite, userId, consent, context);
    return { playerId: invite.playerId, clubId: invite.player.clubId };
  }

  /**
   * The link itself, in one transaction for both accept paths: re-read the
   * invite, refuse a self-guardian and a fifth guardian, create the link,
   * record the parent's own consent for a minor, and mark the invite used.
   * No ClubMembership is created: the link alone opens the child's team pages
   * (design decision 3).
   *
   * Every accept for one player runs one at a time: the transaction first
   * locks the player row, so the checks below read what the previous accept
   * committed. Without it, two accounts using one link at the same moment
   * would both be linked, two parents on two links could push the player past
   * MAX_GUARDIANS_PER_PLAYER, and a double submit from one account would hit
   * the (playerId, userId) key and surface as a 500.
   */
  private async linkFromInvite(
    { id: inviteId, playerId }: { id: string; playerId: string },
    userId: string,
    consent: boolean | undefined,
    context?: AuditRequestContext,
  ): Promise<void> {
    const linked = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Player" WHERE "id" = ${playerId} FOR UPDATE`;
      const invite = await tx.guardianInvite.findUnique({
        where: { id: inviteId },
        include: { player: true },
      });
      if (!invite) {
        throw new NotFoundException('Invitation invalide ou expirée');
      }
      if (invite.acceptedAt) {
        if (invite.acceptedByUserId === userId) {
          return false;
        }
        throw alreadyAccepted();
      }
      if (invite.expiresAt < new Date()) {
        throw new NotFoundException('Invitation invalide ou expirée');
      }

      const { player } = invite;
      if (player.userId === userId) {
        throw refused('Vous ne pouvez pas être votre propre parent');
      }
      assertConsent(player.birthDate, consent);

      const existing = await tx.playerGuardian.findUnique({
        where: { playerId_userId: { playerId: player.id, userId } },
      });
      if (!existing) {
        const count = await tx.playerGuardian.count({ where: { playerId: player.id } });
        if (count >= MAX_GUARDIANS_PER_PLAYER) {
          throw refused(TOO_MANY_GUARDIANS);
        }
        await tx.playerGuardian.create({ data: { playerId: player.id, userId } });
      }

      if (requiresConsent(player.birthDate) && player.birthDate) {
        const attester = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { firstName: true, lastName: true, email: true },
        });
        // Same shape as ClubsService.recordParentalConsent: a new proof is
        // added, never an old one edited, and a clock left running by an
        // earlier removal is stopped now that the player is covered again.
        await tx.parentalConsent.updateMany({
          where: { playerId: player.id, retentionExpiresAt: { not: null } },
          data: { retentionExpiresAt: null },
        });
        await tx.parentalConsent.create({
          data: {
            playerId: player.id,
            clubId: player.clubId,
            playerFirstName: player.firstName,
            playerLastName: player.lastName,
            playerBirthDate: player.birthDate,
            attestedByName: attesterName(attester),
            attestedByUserId: userId,
            source: 'GUARDIAN_IN_APP',
          },
        });
      }

      await tx.guardianInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedByUserId: userId },
      });
      return { playerId: player.id };
    });

    if (linked) {
      this.audit.record({
        type: 'GUARDIAN_INVITE_ACCEPTED',
        userId,
        context,
        metadata: { playerId: linked.playerId },
      });
    }
  }

  private async findInvite(token: string): Promise<InviteWithPlayer> {
    const invite = await this.prisma.guardianInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { player: { include: { club: true } } },
    });
    if (!invite) {
      throw new NotFoundException('Invitation invalide ou expirée');
    }
    return invite;
  }

  private async findLiveInvite(token: string): Promise<InviteWithPlayer> {
    const invite = await this.findInvite(token);
    this.assertLive(invite);
    return invite;
  }

  // Same order and codes as InvitesService.findValidInvite: expired is the
  // generic 404, and only a token that once worked can produce the 409.
  private assertLive(invite: { expiresAt: Date; acceptedAt: Date | null }): void {
    if (invite.expiresAt < new Date()) {
      throw new NotFoundException('Invitation invalide ou expirée');
    }
    if (invite.acceptedAt) {
      throw alreadyAccepted();
    }
  }

  private buildInviteUrl(token: string): string {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return `${frontendUrl}/guardian-invite/${token}`;
  }

  private async findPlayerInClub(
    clubId: string,
    playerId: string,
  ): Promise<{ birthDate: Date | null }> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { clubId: true, birthDate: true },
    });
    if (!player || player.clubId !== clubId) {
      throw new NotFoundException('Player not found');
    }
    return player;
  }
}

function isAdultBirthDate(birthDate: Date | null): boolean {
  return birthDate !== null && !isMinorBirthDate(birthDate.toISOString());
}

// An unknown birth date requires none: a consent record snapshots the birth
// date and can't be written without one.
function requiresConsent(birthDate: Date | null): boolean {
  return isMinorBirthDate(birthDate?.toISOString());
}

function assertConsent(birthDate: Date | null, consent: boolean | undefined): void {
  if (requiresConsent(birthDate) && consent !== true) {
    throw new BadRequestException({
      message: 'Votre autorisation parentale est requise pour suivre un joueur mineur',
      code: PARENTAL_CONSENT_REQUIRED_CODE,
    });
  }
}

// A refusal the invite page shows as-is, told apart from validation 400s.
function refused(message: string): BadRequestException {
  return new BadRequestException({ message, code: GUARDIAN_INVITE_REFUSED_CODE });
}

function alreadyAccepted(): ConflictException {
  return new ConflictException({
    message: 'Cette invitation a déjà été acceptée',
    code: INVITE_ALREADY_ACCEPTED_CODE,
  });
}

function attesterName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}
