-- AlterEnum
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'QUEUED';
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'PARSED';
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'NEEDS_REVIEW';
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "EventScoresheetStatus" ADD VALUE 'FAILED';

-- CreateTable
CREATE TABLE "ScoresheetExtraction" (
    "id" TEXT NOT NULL,
    "eventScoresheetId" TEXT NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "parsedData" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "failureReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoresheetExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoresheetExtraction_eventScoresheetId_key" ON "ScoresheetExtraction"("eventScoresheetId");

-- AddForeignKey
ALTER TABLE "ScoresheetExtraction" ADD CONSTRAINT "ScoresheetExtraction_eventScoresheetId_fkey" FOREIGN KEY ("eventScoresheetId") REFERENCES "EventScoresheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoresheetExtraction" ADD CONSTRAINT "ScoresheetExtraction_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
