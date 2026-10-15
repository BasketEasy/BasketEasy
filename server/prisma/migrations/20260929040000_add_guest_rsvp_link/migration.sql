-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'GUEST_LINK_ENABLED';
ALTER TYPE "AuditEventType" ADD VALUE 'GUEST_LINK_REGENERATED';
ALTER TYPE "AuditEventType" ADD VALUE 'GUEST_LINK_DISABLED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GUEST_INVITE_REQUESTED';

-- CreateEnum
CREATE TYPE "EventRsvpSource" AS ENUM ('APP', 'GUEST_LINK');

-- AlterTable
ALTER TABLE "EventRsvp" ADD COLUMN     "source" "EventRsvpSource" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "TeamGuestLink" (
    "teamId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamGuestLink_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "EventRsvpChange" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "status" "EventRsvpStatus",
    "travelMode" "EventTravelMode",
    "source" "EventRsvpSource" NOT NULL,
    "respondedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvpChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamGuestLink_token_key" ON "TeamGuestLink"("token");

-- CreateIndex
CREATE INDEX "EventRsvpChange_eventId_teamPlayerId_createdAt_idx" ON "EventRsvpChange"("eventId", "teamPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamGuestLink" ADD CONSTRAINT "TeamGuestLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGuestLink" ADD CONSTRAINT "TeamGuestLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvpChange" ADD CONSTRAINT "EventRsvpChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvpChange" ADD CONSTRAINT "EventRsvpChange_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvpChange" ADD CONSTRAINT "EventRsvpChange_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
