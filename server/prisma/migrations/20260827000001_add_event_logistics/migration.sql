-- AlterTable
ALTER TABLE "Event" ADD COLUMN "jerseysTeamPlayerId" TEXT,
ADD COLUMN "ballsTeamPlayerId" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_jerseysTeamPlayerId_fkey" FOREIGN KEY ("jerseysTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ballsTeamPlayerId_fkey" FOREIGN KEY ("ballsTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
