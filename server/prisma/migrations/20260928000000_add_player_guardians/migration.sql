-- CreateEnum
CREATE TYPE "ParentalConsentSource" AS ENUM ('STAFF_ATTESTATION', 'GUARDIAN_IN_APP');

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'GUARDIAN_INVITE_ACCEPTED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "subjectFirstName" TEXT;

-- AlterTable
ALTER TABLE "EventRsvp" ADD COLUMN     "respondedByUserId" TEXT;

-- AlterTable
ALTER TABLE "ParentalConsent" ADD COLUMN     "source" "ParentalConsentSource" NOT NULL DEFAULT 'STAFF_ATTESTATION';

-- CreateTable
CREATE TABLE "PlayerGuardian" (
    "playerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerGuardian_pkey" PRIMARY KEY ("playerId","userId")
);

-- CreateTable
CREATE TABLE "GuardianInvite" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerGuardian_userId_idx" ON "PlayerGuardian"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianInvite_tokenHash_key" ON "GuardianInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "GuardianInvite_playerId_idx" ON "GuardianInvite"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerGuardian" ADD CONSTRAINT "PlayerGuardian_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGuardian" ADD CONSTRAINT "PlayerGuardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianInvite" ADD CONSTRAINT "GuardianInvite_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianInvite" ADD CONSTRAINT "GuardianInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianInvite" ADD CONSTRAINT "GuardianInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

