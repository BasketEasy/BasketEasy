-- CreateTable
CREATE TABLE "EventConvocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "convokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventConvocation_eventId_teamPlayerId_key" ON "EventConvocation"("eventId", "teamPlayerId");

-- CreateIndex
CREATE INDEX "EventConvocation_eventId_idx" ON "EventConvocation"("eventId");

-- AddForeignKey
ALTER TABLE "EventConvocation" ADD CONSTRAINT "EventConvocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConvocation" ADD CONSTRAINT "EventConvocation_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
