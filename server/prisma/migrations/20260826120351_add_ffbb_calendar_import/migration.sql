-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "ffbbClubCode" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "timeConfirmed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TeamFfbbLink" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "ffbbEngagementRef" TEXT NOT NULL,
    "ffbbEngagementLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamFfbbLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamFfbbLink_ffbbEngagementRef_key" ON "TeamFfbbLink"("ffbbEngagementRef");

-- CreateIndex
CREATE INDEX "TeamFfbbLink_teamId_idx" ON "TeamFfbbLink"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Club_ffbbClubCode_key" ON "Club"("ffbbClubCode");

-- CreateIndex
CREATE UNIQUE INDEX "Event_teamId_externalId_key" ON "Event"("teamId", "externalId");

-- AddForeignKey
ALTER TABLE "TeamFfbbLink" ADD CONSTRAINT "TeamFfbbLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

