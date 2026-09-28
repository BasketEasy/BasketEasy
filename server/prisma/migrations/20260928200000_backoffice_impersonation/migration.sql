-- CreateEnum
CREATE TYPE "ImpersonationEndReason" AS ENUM ('EXITED', 'REPLACED');

-- AlterEnum
-- Same ADD VALUE-inside-a-transaction note as
-- 20260928010000_add_platform_admin: nothing here writes a row using them.
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_IMPERSONATION_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_IMPERSONATION_ENDED';

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" "ImpersonationEndReason",

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationSession_actorUserId_endedAt_idx" ON "ImpersonationSession"("actorUserId", "endedAt");

-- CreateIndex
CREATE INDEX "ImpersonationSession_expiresAt_idx" ON "ImpersonationSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
