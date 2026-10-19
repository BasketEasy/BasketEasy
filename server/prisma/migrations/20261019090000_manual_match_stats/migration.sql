-- CreateEnum
CREATE TYPE "EventScoresheetSource" AS ENUM ('UPLOAD', 'MANUAL');

-- AlterTable
ALTER TABLE "EventScoresheet" ALTER COLUMN "storageKey" DROP NOT NULL,
ADD COLUMN     "source" "EventScoresheetSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "statsEditedAt" TIMESTAMP(3);
