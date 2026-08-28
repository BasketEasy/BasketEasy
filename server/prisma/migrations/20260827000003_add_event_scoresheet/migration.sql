-- CreateEnum
CREATE TYPE "EventScoresheetStatus" AS ENUM ('UPLOADED');

-- CreateTable
CREATE TABLE "EventScoresheet" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "EventScoresheetStatus" NOT NULL DEFAULT 'UPLOADED',
    "r2Key" TEXT NOT NULL,
    "uploadedByTeamPlayerId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventScoresheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventScoresheet_eventId_key" ON "EventScoresheet"("eventId");

-- AddForeignKey
ALTER TABLE "EventScoresheet" ADD CONSTRAINT "EventScoresheet_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventScoresheet" ADD CONSTRAINT "EventScoresheet_uploadedByTeamPlayerId_fkey" FOREIGN KEY ("uploadedByTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
