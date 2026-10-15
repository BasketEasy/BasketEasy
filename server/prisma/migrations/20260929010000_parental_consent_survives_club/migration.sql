-- DropForeignKey
ALTER TABLE "ParentalConsent" DROP CONSTRAINT "ParentalConsent_clubId_fkey";

-- AlterTable
ALTER TABLE "ParentalConsent" ADD COLUMN     "clubName" TEXT,
ALTER COLUMN "clubId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
