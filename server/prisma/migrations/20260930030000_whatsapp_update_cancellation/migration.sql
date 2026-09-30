-- AlterEnum
ALTER TYPE "EventShareType" ADD VALUE 'UPDATE';
ALTER TYPE "EventShareType" ADD VALUE 'CANCELLATION';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "waUpdateTemplate" TEXT,
ADD COLUMN     "waCancellationTemplate" TEXT;

-- AlterTable: teamId is added nullable, backfilled from the event, then made required.
ALTER TABLE "EventShare" ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "sentVars" JSONB,
ADD COLUMN     "eventSnapshot" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

UPDATE "EventShare" SET "teamId" = "Event"."teamId" FROM "Event" WHERE "Event"."id" = "EventShare"."eventId";

ALTER TABLE "EventShare" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "EventShare" ALTER COLUMN "eventId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "EventShare" DROP CONSTRAINT "EventShare_eventId_fkey";

-- CreateIndex
CREATE INDEX "EventShare_teamId_state_idx" ON "EventShare"("teamId", "state");

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
