-- CreateEnum
CREATE TYPE "EventVoteCategory" AS ENUM ('BEST', 'WORST');

-- CreateTable
CREATE TABLE "EventVote" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "category" "EventVoteCategory" NOT NULL,
    "voterTeamPlayerId" TEXT NOT NULL,
    "votedTeamPlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventVote_eventId_category_voterTeamPlayerId_key" ON "EventVote"("eventId", "category", "voterTeamPlayerId");

-- CreateIndex
CREATE INDEX "EventVote_eventId_category_idx" ON "EventVote"("eventId", "category");

-- AddForeignKey
ALTER TABLE "EventVote" ADD CONSTRAINT "EventVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVote" ADD CONSTRAINT "EventVote_voterTeamPlayerId_fkey" FOREIGN KEY ("voterTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVote" ADD CONSTRAINT "EventVote_votedTeamPlayerId_fkey" FOREIGN KEY ("votedTeamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
