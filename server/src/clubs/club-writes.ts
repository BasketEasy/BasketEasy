import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ParentalConsent as ParentalConsentRow, Prisma } from '@prisma/client';
import type { ParentalConsentSource } from '@basketeasy/types/guardians';

// Writes that both ClubsService (a club admin) and the platform back-office
// (Kluvo staff, audited) perform. They take the transaction client so the
// back-office can commit its audit row in the same transaction as the change,
// and live here once so the two paths can't drift apart.

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

  if (membership.role === 'ADMIN') {
    const adminCount = await tx.clubMembership.count({ where: { clubId, role: 'ADMIN' } });
    if (adminCount <= 1) {
      throw new BadRequestException('Cannot remove the last admin of a club');
    }
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
