-- CreateEnum
CREATE TYPE "JerseyDutySource" AS ENUM ('SUGGESTION', 'SELF', 'MANAGER', 'SWAP', 'BACKFILL');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "jerseyRotationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TeamPlayer" ADD COLUMN     "jerseyDutyExempt" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EventJerseyDuty" (
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT,
    "source" "JerseyDutySource" NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneByUserId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "swapToTeamPlayerId" TEXT,
    "swapRequestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventJerseyDuty_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "EventJerseyDecline" (
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "declinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventJerseyDecline_pkey" PRIMARY KEY ("eventId","teamPlayerId")
);

-- CreateIndex
CREATE INDEX "EventJerseyDuty_teamPlayerId_idx" ON "EventJerseyDuty"("teamPlayerId");

-- CreateIndex
CREATE INDEX "EventJerseyDuty_swapToTeamPlayerId_idx" ON "EventJerseyDuty"("swapToTeamPlayerId");

-- CreateIndex
CREATE INDEX "EventJerseyDecline_teamPlayerId_idx" ON "EventJerseyDecline"("teamPlayerId");

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_swapToTeamPlayerId_fkey" FOREIGN KEY ("swapToTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDuty" ADD CONSTRAINT "EventJerseyDuty_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDecline" ADD CONSTRAINT "EventJerseyDecline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventJerseyDecline" ADD CONSTRAINT "EventJerseyDecline_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. « Brought to match N » and « washed after match N-1 » are the same
-- fact, so a MATCH's jerseysTeamPlayerId becomes the duty row of the team's
-- previous MATCH. A team's first match has no previous one: its value is
-- dropped. ON CONFLICT keeps a row that already exists.
INSERT INTO "EventJerseyDuty" ("eventId", "teamPlayerId", "source", "updatedAt")
SELECT "prevId", "jerseysTeamPlayerId", 'BACKFILL', CURRENT_TIMESTAMP
FROM (
    SELECT
        "jerseysTeamPlayerId",
        LAG("id") OVER (PARTITION BY "teamId" ORDER BY "startsAt", "id") AS "prevId"
    FROM "Event"
    WHERE "type" = 'MATCH'
) AS m
WHERE m."jerseysTeamPlayerId" IS NOT NULL AND m."prevId" IS NOT NULL
ON CONFLICT ("eventId") DO NOTHING;

-- A MATCH no longer stores « qui apporte »: it is derived from the previous
-- match's duty. The column stays for the TRAINING chasubles.
UPDATE "Event" SET "jerseysTeamPlayerId" = NULL WHERE "type" = 'MATCH';
