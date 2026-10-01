import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type Club as ClubRow,
  type ParentalConsent as ParentalConsentRow,
} from '@prisma/client';
import type { ParentalConsentSource } from '@basketeasy/types/guardians';

// Writes that both ClubsService (a club admin) and the platform back-office
// (Kluvo staff, audited) perform. They take the transaction client so the
// back-office can commit its audit row in the same transaction as the change,
// and live here once so the two paths can't drift apart.

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** A duplicate FFBB club code (the column is unique) as the 409 both callers show. */
export function toFfbbClubCodeError(err: unknown): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return new ConflictException('Ce code club FFBB est déjà utilisé par un autre club');
  }
  return err;
}

/**
 * Creates a club with `userId` as its first ADMIN. A club never exists
 * without an admin: the membership is written in the same statement.
 */
export async function createClubWithAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
  data: { name: string; ffbbClubCode?: string | null },
): Promise<ClubRow> {
  try {
    return await tx.club.create({
      data: {
        name: data.name,
        ffbbClubCode: data.ffbbClubCode ?? null,
        memberships: { create: { userId, role: 'ADMIN' } },
      },
    });
  } catch (err) {
    throw toFfbbClubCodeError(err);
  }
}

/**
 * Counts a club's ADMINs while holding their rows (`FOR UPDATE`), so two
 * transactions removing or demoting the club's last two admins at once run
 * one after the other: the second sees one admin left and refuses. A plain
 * `count` lets both see two and both succeed, leaving the club with none.
 * Shared by the product's removal and the back-office's role change.
 */
export async function lockClubAdmins(
  tx: Prisma.TransactionClient,
  clubId: string,
): Promise<number> {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ClubMembership"
    WHERE "clubId" = ${clubId} AND "role" = 'ADMIN'
    FOR UPDATE`;
  return admins.length;
}

/**
 * Takes a user out of a club. Their roster entries are unlinked, not deleted:
 * the account loses club access, but the player's history (stats,
 * attendance) belongs to the club.
 */
export async function removeClubMembership(
  tx: Prisma.TransactionClient,
  clubId: string,
  userId: string,
): Promise<void> {
  const membership = await tx.clubMembership.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (!membership) {
    throw new NotFoundException('Membership not found');
  }

  if (membership.role === 'ADMIN' && (await lockClubAdmins(tx, clubId)) <= 1) {
    throw new BadRequestException('Impossible de retirer le dernier admin du club');
  }

  await tx.player.updateMany({ where: { clubId, userId }, data: { userId: null } });
  await tx.clubMembership.delete({ where: { userId_clubId: { userId, clubId } } });
}

/**
 * Records a parental consent as a new row: a consent proof is evidence, and
 * evidence is not rewritten. Any earlier row for this player has its
 * retention clock cleared, so re-recording consent for a player who was
 * removed and re-added doesn't leave a proof expiring under a live entry.
 */
export async function writeParentalConsent(
  tx: Prisma.TransactionClient,
  player: { id: string; clubId: string; firstName: string; lastName: string; birthDate: Date },
  attestation: { name: string; userId: string | null; source?: ParentalConsentSource },
): Promise<ParentalConsentRow> {
  await tx.parentalConsent.updateMany({
    where: { playerId: player.id, retentionExpiresAt: { not: null } },
    data: { retentionExpiresAt: null },
  });
  return tx.parentalConsent.create({
    data: {
      playerId: player.id,
      clubId: player.clubId,
      playerFirstName: player.firstName,
      playerLastName: player.lastName,
      playerBirthDate: player.birthDate,
      attestedByName: attestation.name,
      attestedByUserId: attestation.userId,
      ...(attestation.source ? { source: attestation.source } : {}),
    },
  });
}
