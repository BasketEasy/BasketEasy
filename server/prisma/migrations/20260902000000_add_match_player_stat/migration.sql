-- CreateTable
CREATE TABLE "MatchPlayerStat" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "jerseyNumber" INTEGER,
    "points" INTEGER,
    "fouls" INTEGER,
    "freeThrowPoints" INTEGER,
    "twoPointPoints" INTEGER,
    "threePointPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchPlayerStat_teamPlayerId_idx" ON "MatchPlayerStat"("teamPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayerStat_eventId_teamPlayerId_key" ON "MatchPlayerStat"("eventId", "teamPlayerId");

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
