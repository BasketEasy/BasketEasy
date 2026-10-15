-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'REFRESH_TOKEN_REUSE_DETECTED', 'EMAIL_VERIFIED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "userId" TEXT,
    "actorEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentalConsent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "clubId" TEXT NOT NULL,
    "playerFirstName" TEXT NOT NULL,
    "playerLastName" TEXT NOT NULL,
    "playerBirthDate" TIMESTAMP(3) NOT NULL,
    "attestedByName" TEXT NOT NULL,
    "attestedByUserId" TEXT,
    "consentGivenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionExpiresAt" TIMESTAMP(3),

    CONSTRAINT "ParentalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB NOT NULL,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "ParentalConsent_playerId_idx" ON "ParentalConsent"("playerId");

-- CreateIndex
CREATE INDEX "ParentalConsent_clubId_idx" ON "ParentalConsent"("clubId");

-- CreateIndex
CREATE INDEX "ParentalConsent_retentionExpiresAt_idx" ON "ParentalConsent"("retentionExpiresAt");

-- CreateIndex
CREATE INDEX "RetentionRun_ranAt_idx" ON "RetentionRun"("ranAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_attestedByUserId_fkey" FOREIGN KEY ("attestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
