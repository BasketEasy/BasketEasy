import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClubRole } from '@prisma/client';
import type { Request } from 'express';
import {
  ADMIN_OCR_STUCK_AFTER_MS,
  type AdminActionResult,
  type AdminCreateClubResult,
  type AdminSupportActionKind,
} from '@basketeasy/types/platform-admin-actions';
import { isMinorBirthDate } from '@basketeasy/types/parental-consent';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSecurityService } from '../auth/account-security.service';
import { ScoresheetsService } from '../scoresheets/scoresheets.service';
import { StorageService } from '../storage/storage.service';
import {
  createClubWithAdmin,
  lockClubAdmins,
  removeClubMembership,
  writeParentalConsent,
} from '../clubs/club-writes';
import { parentalConsentRetentionExpiry } from '../common/parental-consent-retention';
import { auditContextOf } from './audit-context';
import type { PlatformActor } from './platform-admin-browse.service';

/**
 * Staff never act on their own account from here: marking your own address
 * verified would bypass EmailVerifiedGuard, and granting yourself a club or
 * team role would make a support tool a way into a club's data.
 */
function assertNotSelf(actor: PlatformActor, userId: string): void {
  if (userId === actor.id) {
    throw new ForbiddenException('Impossible sur votre propre compte');
  }
}

function throttled(): HttpException {
  return new HttpException(
    'Un e-mail a déjà été envoyé à ce compte il y a moins d’une minute. Réessayez dans un instant.',
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

const CLUB_DELETE_TIMEOUT_MS = 120_000;
// The OCR retry enqueues inside its transaction (so a dead queue rolls the
// audit row back); a slow Redis must not hit Prisma's 5 s default and roll back
// a row whose job did land.
const OCR_RETRY_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const STORAGE_DELETE_CONCURRENCY = 10;

/** Who and what an action row is about, beside `action` and `reason`. */
interface ActionSubjects {
  subjectUserId?: string;
  subjectPlayerId?: string;
  clubId?: string;
  teamId?: string;
  eventId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * The back-office's named support actions.
 *
 * Every one is open to both platform roles, requires a reason, and writes one
 * ADMIN_SUPPORT_ACTION row **in the same transaction as the change**, so a
 * change without its audit row, or a row for a change that didn't happen,
 * cannot exist. Actions whose effect leaves the database (an e-mail, a queued
 * job) write the row first and trigger the effect after the commit.
 *
 * The rules are the product's own: membership removal and consent recording
 * go through the same helpers as ClubsService (`clubs/club-writes.ts`), the
 * verification and reset e-mails through AccountSecurityService, the OCR retry
 * through ScoresheetsService. A back-office fix must never produce a state the
 * product itself refuses. What the back-office adds is stricter, never looser:
 * the last-ADMIN check runs under a row lock, so two staff demoting the two
 * admins of one club at once can't both succeed.
 *
 * See docs/superpowers/specs/2026-09-28-backoffice-v2-part5-support-actions.md.
 */
@Injectable()
export class PlatformAdminActionsService {
  private readonly logger = new Logger(PlatformAdminActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountSecurity: AccountSecurityService,
    private readonly scoresheets: ScoresheetsService,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------- accounts

  async resendVerification(
    actor: PlatformActor,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    const user = await this.findUser(userId);
    if (user.emailVerifiedAt) {
      throw new ConflictException('Cette adresse est déjà vérifiée');
    }
    // Throttled like the product's own resend (one a minute). Checked before
    // the row is written, so an audit entry never claims an e-mail the
    // throttle then swallowed.
    if (await this.accountSecurity.isVerificationThrottled(userId)) {
      throw throttled();
    }
    const result = await this.prisma.$transaction((tx) =>
      this.record(tx, actor, request, 'RESEND_VERIFICATION', reason, { subjectUserId: userId }),
    );
    // After the commit: an e-mail can't be rolled back.
    await this.accountSecurity.sendVerificationEmail(userId);
    return result;
  }

  async markEmailVerified(
    actor: PlatformActor,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    const user = await this.findUser(userId);
    if (user.emailVerifiedAt) {
      throw new ConflictException('Cette adresse est déjà vérifiée');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      return this.record(tx, actor, request, 'MARK_EMAIL_VERIFIED', reason, {
        subjectUserId: userId,
      });
    });
  }

  /** Staff never see or set a password: this sends the ordinary reset link. */
  async sendPasswordReset(
    actor: PlatformActor,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    const user = await this.findUser(userId);
    if (await this.accountSecurity.isPasswordResetThrottled(userId)) {
      throw throttled();
    }
    const result = await this.prisma.$transaction((tx) =>
      this.record(tx, actor, request, 'SEND_PASSWORD_RESET', reason, { subjectUserId: userId }),
    );
    // Staff-origin: the reset's own audit row must not carry the staff
    // member's IP under the subject's userId (see requestPasswordReset).
    await this.accountSecurity.requestPasswordReset(user.email, undefined, { byStaff: true });
    return result;
  }

  async revokeSessions(
    actor: PlatformActor,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    // Also: revoking your own sessions would end the step-up session
    // mid-request.
    assertNotSelf(actor, userId);
    await this.findUser(userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      return this.record(tx, actor, request, 'REVOKE_SESSIONS', reason, {
        subjectUserId: userId,
        after: { revokedSessions: count },
      });
    });
  }

  // ---------------------------------------------------------- memberships

  async changeClubRole(
    actor: PlatformActor,
    clubId: string,
    userId: string,
    role: ClubRole,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    return this.prisma.$transaction(async (tx) => {
      const membership = await this.findMembership(tx, clubId, userId);
      if (membership.role === role) {
        throw new ConflictException('Ce membre a déjà ce rôle');
      }
      if (membership.role === 'ADMIN') {
        await this.assertNotLastAdmin(tx, clubId);
      }
      await tx.clubMembership.update({
        where: { userId_clubId: { userId, clubId } },
        data: { role },
      });
      return this.record(tx, actor, request, 'CHANGE_CLUB_ROLE', reason, {
        subjectUserId: userId,
        clubId,
        before: { role: membership.role },
        after: { role },
      });
    });
  }

  async removeMembership(
    actor: PlatformActor,
    clubId: string,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    return this.prisma.$transaction(async (tx) => {
      const membership = await this.findMembership(tx, clubId, userId);
      if (membership.role === 'ADMIN') {
        await this.assertNotLastAdmin(tx, clubId);
      }
      await removeClubMembership(tx, clubId, userId);
      return this.record(tx, actor, request, 'REMOVE_MEMBERSHIP', reason, {
        subjectUserId: userId,
        clubId,
        before: { role: membership.role },
      });
    });
  }

  // ----------------------------------------------------------------- teams

  /**
   * Same eligibility as the product (a member of a club linked to the team),
   * without EmailVerifiedGuard: staff checked the person out-of-band.
   */
  async addTeamAdmin(
    actor: PlatformActor,
    teamId: string,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    await this.findTeam(teamId);
    const eligible = await this.prisma.clubMembership.findFirst({
      where: { userId, club: { clubTeams: { some: { teamId } } } },
      select: { id: true },
    });
    if (!eligible) {
      throw new ConflictException('Ce compte doit être membre d’un club lié à l’équipe');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.teamAdmin.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (existing) {
        throw new ConflictException('Ce compte gère déjà cette équipe');
      }
      await tx.teamAdmin.create({ data: { teamId, userId } });
      return this.record(tx, actor, request, 'ADD_TEAM_ADMIN', reason, {
        subjectUserId: userId,
        teamId,
      });
    });
  }

  /** No last-manager block: staff are the fallback when someone is locked out. */
  async removeTeamAdmin(
    actor: PlatformActor,
    teamId: string,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    assertNotSelf(actor, userId);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.teamAdmin.deleteMany({ where: { teamId, userId } });
      if (count === 0) {
        throw new NotFoundException('Ce compte ne gère pas cette équipe');
      }
      return this.record(tx, actor, request, 'REMOVE_TEAM_ADMIN', reason, {
        subjectUserId: userId,
        teamId,
      });
    });
  }

  async transferTeamOwnership(
    actor: PlatformActor,
    teamId: string,
    clubId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    await this.findTeam(teamId);
    return this.prisma.$transaction(async (tx) => {
      const links = await tx.clubTeam.findMany({
        where: { teamId },
        select: { clubId: true, isOwner: true },
      });
      const target = links.find((link) => link.clubId === clubId);
      if (!target) {
        throw new ConflictException('Ce club n’est pas lié à l’équipe');
      }
      if (target.isOwner) {
        throw new ConflictException('Ce club est déjà propriétaire de l’équipe');
      }
      const previousOwner = links.find((link) => link.isOwner)?.clubId ?? null;
      await tx.clubTeam.updateMany({ where: { teamId }, data: { isOwner: false } });
      await tx.clubTeam.update({
        where: { clubId_teamId: { clubId, teamId } },
        data: { isOwner: true },
      });
      return this.record(tx, actor, request, 'TRANSFER_TEAM_OWNERSHIP', reason, {
        teamId,
        clubId,
        before: { ownerClubId: previousOwner },
        after: { ownerClubId: clubId },
      });
    });
  }

  // ----------------------------------------------------------- scoresheets

  async retryOcr(
    actor: PlatformActor,
    scoresheetId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    const sheet = await this.prisma.eventScoresheet.findUnique({
      where: { id: scoresheetId },
      select: { id: true, eventId: true, status: true, uploadedAt: true },
    });
    if (!sheet) {
      throw new NotFoundException('Feuille de marque introuvable');
    }
    // The product's own rule: a confirmed sheet is a manager's ground truth.
    if (sheet.status === 'CONFIRMED') {
      throw new ConflictException(
        'Cette feuille a déjà été confirmée : le club doit renvoyer le fichier pour une nouvelle lecture',
      );
    }
    const inFlight = sheet.status === 'QUEUED' || sheet.status === 'PROCESSING';
    if (inFlight && sheet.uploadedAt.getTime() > Date.now() - ADMIN_OCR_STUCK_AFTER_MS) {
      throw new ConflictException('Une lecture est déjà en cours pour cette feuille');
    }
    // The enqueue runs inside the transaction, last: if the queue is
    // unreachable the audit row rolls back with it instead of recording a
    // retry that never happened. A stuck sheet's leftover job is replaced,
    // since BullMQ would otherwise ignore the new one.
    return this.prisma.$transaction(async (tx) => {
      const result = await this.record(tx, actor, request, 'RETRY_OCR', reason, {
        eventId: sheet.eventId,
        before: { status: sheet.status },
      });
      await this.scoresheets.enqueueOcr(sheet.id, { replaceStale: inFlight });
      return result;
    }, OCR_RETRY_TX_OPTIONS);
  }

  // ----------------------------------------------------- guardians/consent

  async cancelGuardianInvite(
    actor: PlatformActor,
    playerId: string,
    inviteId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    return this.prisma.$transaction(async (tx) => {
      // The same delete GuardiansService.cancelInvite makes: an accepted
      // invite is a link now, and is removed as one.
      const { count } = await tx.guardianInvite.deleteMany({
        where: { id: inviteId, playerId, acceptedAt: null },
      });
      if (count === 0) {
        throw new NotFoundException('Invitation introuvable');
      }
      return this.record(tx, actor, request, 'CANCEL_GUARDIAN_INVITE', reason, {
        subjectPlayerId: playerId,
      });
    });
  }

  async removeGuardian(
    actor: PlatformActor,
    playerId: string,
    userId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.playerGuardian.deleteMany({ where: { playerId, userId } });
      if (count === 0) {
        throw new NotFoundException('Ce parent n’est pas lié à ce joueur');
      }
      return this.record(tx, actor, request, 'REMOVE_GUARDIAN', reason, {
        subjectPlayerId: playerId,
        subjectUserId: userId,
      });
    });
  }

  /**
   * Recorded as PLATFORM_STAFF, never as the club's own attestation: the
   * evidence has to say who actually took the consent. The attester name
   * snapshots the admin and what they were told, since the admin's account
   * may later be deleted.
   */
  async recordParentalConsent(
    actor: PlatformActor,
    playerId: string,
    givenBy: string,
    method: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    const [player, admin] = await Promise.all([
      this.prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, clubId: true, firstName: true, lastName: true, birthDate: true },
      }),
      this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { firstName: true, lastName: true, email: true },
      }),
    ]);
    if (!player) {
      throw new NotFoundException('Joueur introuvable');
    }
    const birthDate = player.birthDate;
    if (!birthDate) {
      throw new BadRequestException(
        'Renseignez la date de naissance du joueur avant d’enregistrer une autorisation parentale',
      );
    }
    if (!isMinorBirthDate(birthDate.toISOString())) {
      throw new BadRequestException('Ce joueur est majeur : aucune autorisation n’est nécessaire');
    }
    const adminName =
      [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || admin?.email || actor.email;

    return this.prisma.$transaction(async (tx) => {
      await writeParentalConsent(
        tx,
        { ...player, birthDate },
        {
          name: `${adminName} (Kluvo) — ${givenBy}, ${method}`,
          userId: actor.id,
          source: 'PLATFORM_STAFF',
        },
      );
      return this.record(tx, actor, request, 'RECORD_PARENTAL_CONSENT', reason, {
        subjectPlayerId: playerId,
        clubId: player.clubId,
      });
    });
  }

  // ----------------------------------------------------------------- clubs

  /**
   * A new club and its first ADMIN, who must already have an account: the
   * back-office never creates people. An unverified first admin is allowed —
   * EmailVerifiedGuard still gates what they can hand out until they confirm.
   */
  async createClub(
    actor: PlatformActor,
    data: { name: string; ffbbClubCode?: string; firstAdminUserId: string },
    reason: string,
    request: Request,
  ): Promise<AdminCreateClubResult> {
    assertNotSelf(actor, data.firstAdminUserId);
    await this.findUser(data.firstAdminUserId);
    return this.prisma.$transaction(async (tx) => {
      const club = await createClubWithAdmin(tx, data.firstAdminUserId, data);
      const result = await this.record(tx, actor, request, 'CLUB_CREATED', reason, {
        clubId: club.id,
        subjectUserId: data.firstAdminUserId,
        after: { name: club.name, ffbbClubCode: club.ffbbClubCode },
      });
      return { ...result, clubId: club.id };
    });
  }

  /**
   * Deletes a club and everything that is the club's: memberships, players
   * (their roster slots, stats, invites, guardian links cascade), parental
   * consents, and every team it owns with that team's events, scoresheets,
   * extractions, stats and meeting points. A team it only partners on stays
   * with its owner, minus this club's players.
   *
   * Owned teams are deleted here rather than by the database: Team reaches
   * Club only through ClubTeam, so the FK cascade would leave them orphaned.
   * Scoresheet files are removed from storage after the commit, best-effort —
   * a stray object costs storage, a rolled-back delete over a storage outage
   * would cost the action.
   */
  async deleteClub(
    actor: PlatformActor,
    clubId: string,
    reason: string,
    request: Request,
  ): Promise<AdminActionResult> {
    const { result, storageKeys } = await this.prisma.$transaction(
      async (tx) => {
        const club = await tx.club.findUnique({
          where: { id: clubId },
          select: { name: true, ffbbClubCode: true },
        });
        if (!club) {
          throw new NotFoundException('Club introuvable');
        }
        const [owned, partnerOnCount] = await Promise.all([
          tx.clubTeam.findMany({ where: { clubId, isOwner: true }, select: { teamId: true } }),
          tx.clubTeam.count({ where: { clubId, isOwner: false } }),
        ]);
        const lockedTeamIds = owned.map((link) => link.teamId);
        // Lock the owned Team rows before looking for partners: linking a club
        // to a team takes a key-share lock on that row, so a link added by a
        // concurrent request either commits before this read (and is seen) or
        // waits until this deletion is done. Without it the check below is a
        // plain READ COMMITTED read and a fresh partner's rosters would go too.
        if (lockedTeamIds.length > 0) {
          await tx.$queryRaw`SELECT "id" FROM "Team" WHERE "id" IN (${Prisma.join(lockedTeamIds)}) FOR UPDATE`;
        }
        const partnered = await tx.clubTeam.findMany({
          where: { teamId: { in: lockedTeamIds }, clubId: { not: clubId } },
          select: { teamId: true },
          distinct: ['teamId'],
        });
        // A CTC team the club owns also holds its partners' rosters, events,
        // scoresheets and stats. Deleting it would destroy another club's
        // data, so the ownership has to move to a partner first.
        if (partnered.length > 0) {
          throw new ConflictException({
            message: `Ce club possède ${partnered.length} équipe(s) partagée(s) avec d'autres clubs : transférez-en la propriété avant de supprimer le club.`,
            sharedTeamIds: partnered.map((link) => link.teamId),
          });
        }
        const ownedTeamIds = lockedTeamIds;
        // Both the owned teams' sheets and any sheet one of this club's players
        // uploaded on a partner's team: EventScoresheet cascades with its
        // uploader's roster slot, so those rows go too.
        const [sheets, playerCount] = await Promise.all([
          tx.eventScoresheet.findMany({
            where: {
              OR: [
                { event: { teamId: { in: ownedTeamIds } } },
                { uploadedBy: { player: { clubId } } },
              ],
            },
            select: { storageKey: true },
          }),
          tx.player.count({ where: { clubId } }),
        ]);
        // Consent evidence outlives the club (RGPD art. 17.3.b): it keeps the
        // club's name, and its five-year clock starts now, the same as when a
        // club removes a single player.
        const [consentCount] = await Promise.all([
          tx.parentalConsent.updateMany({ where: { clubId }, data: { clubName: club.name } }),
          tx.parentalConsent.updateMany({
            where: { clubId, retentionExpiresAt: null },
            data: { retentionExpiresAt: parentalConsentRetentionExpiry() },
          }),
        ]);
        await tx.team.deleteMany({ where: { id: { in: ownedTeamIds } } });
        await tx.club.delete({ where: { id: clubId } });
        const result = await this.record(tx, actor, request, 'CLUB_DELETED', reason, {
          clubId,
          // The club no longer exists, so the row has to say what it was.
          before: {
            name: club.name,
            ffbbClubCode: club.ffbbClubCode,
            ownedTeamCount: ownedTeamIds.length,
            partnerOnTeamCount: partnerOnCount,
            playerCount,
            parentalConsentsKept: consentCount.count,
            scoresheetFileCount: sheets.length,
          },
        });
        return { result, storageKeys: sheets.map((sheet) => sheet.storageKey) };
      },
      // A large club has many rows to cascade; Prisma's 5s default would roll
      // the whole deletion back (P2028) for exactly the biggest clubs.
      { maxWait: 10_000, timeout: CLUB_DELETE_TIMEOUT_MS },
    );
    await this.deleteScoresheetFiles(result.auditLogId, storageKeys);
    return result;
  }

  /**
   * Best-effort, after the commit: the rows that held the keys are gone, so a
   * failed delete is logged and written onto the CLUB_DELETED row, where a
   * later cleanup can find it, instead of disappearing silently. Bounded, so
   * a club with hundreds of sheets doesn't open hundreds of requests at once.
   */
  private async deleteScoresheetFiles(auditLogId: string, keys: string[]): Promise<void> {
    const failed: string[] = [];
    for (let i = 0; i < keys.length; i += STORAGE_DELETE_CONCURRENCY) {
      const batch = keys.slice(i, i + STORAGE_DELETE_CONCURRENCY);
      const outcomes = await Promise.allSettled(batch.map((key) => this.storage.deleteObject(key)));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'rejected') failed.push(batch[index]);
      });
    }
    if (failed.length === 0) return;
    this.logger.error(
      `Club deletion ${auditLogId}: ${failed.length} scoresheet file(s) not deleted: ${failed.join(', ')}`,
    );
    try {
      const row = await this.prisma.auditLog.findUnique({
        where: { id: auditLogId },
        select: { metadata: true },
      });
      await this.prisma.auditLog.update({
        where: { id: auditLogId },
        data: {
          metadata: {
            ...(row?.metadata as Prisma.JsonObject | null),
            failedStorageKeys: failed,
          },
        },
      });
    } catch (err: unknown) {
      this.logger.error(`Could not record failed storage keys: ${String(err)}`);
    }
  }

  // --------------------------------------------------------------- helpers

  /** Writes the one audit row an action produces, through the action's transaction. */
  async record(
    tx: Prisma.TransactionClient,
    actor: PlatformActor,
    request: Request,
    action: AdminSupportActionKind,
    reason: string,
    subjects: ActionSubjects,
  ): Promise<AdminActionResult> {
    const context = auditContextOf(request);
    const row = await tx.auditLog.create({
      data: {
        type: 'ADMIN_SUPPORT_ACTION',
        userId: actor.id,
        actorEmail: actor.email,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { action, reason, ...subjects },
      },
      select: { id: true },
    });
    return { action, auditLogId: row.id };
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('Compte introuvable');
    }
    return user;
  }

  private async findTeam(teamId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }
  }

  private async findMembership(tx: Prisma.TransactionClient, clubId: string, userId: string) {
    const membership = await tx.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException('Ce compte n’est pas membre de ce club');
    }
    return membership;
  }

  /**
   * Locks the club's ADMIN memberships for the rest of the transaction, then
   * counts them: two concurrent demotions of a two-admin club are serialised,
   * and the second sees one admin left and is refused.
   */
  private async assertNotLastAdmin(tx: Prisma.TransactionClient, clubId: string): Promise<void> {
    if ((await lockClubAdmins(tx, clubId)) <= 1) {
      throw new ConflictException('C’est le dernier admin du club : nommez d’abord un autre admin');
    }
  }
}
