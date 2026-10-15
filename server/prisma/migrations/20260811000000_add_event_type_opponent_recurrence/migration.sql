-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRAINING', 'MATCH');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "type" "EventType" NOT NULL DEFAULT 'TRAINING';
ALTER TABLE "Event" ADD COLUMN "opponentName" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrenceId" TEXT;

-- CreateIndex
CREATE INDEX "Event_recurrenceId_idx" ON "Event"("recurrenceId");
