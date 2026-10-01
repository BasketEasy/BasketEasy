-- DropForeignKey
ALTER TABLE "EventScoresheet" DROP CONSTRAINT "EventScoresheet_uploadedByTeamPlayerId_fkey";

-- AlterTable
ALTER TABLE "EventScoresheet" ALTER COLUMN "uploadedByTeamPlayerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "EventScoresheet" ADD CONSTRAINT "EventScoresheet_uploadedByTeamPlayerId_fkey" FOREIGN KEY ("uploadedByTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
