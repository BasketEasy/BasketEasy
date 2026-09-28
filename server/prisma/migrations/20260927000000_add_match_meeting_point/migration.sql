-- CreateEnum
CREATE TYPE "EventTravelMode" AS ENUM ('MEETING_POINT', 'DIRECT');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "arrivalBufferMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "meetingPointAddress" TEXT,
ADD COLUMN     "meetingPointName" TEXT;

-- AlterTable
ALTER TABLE "EventRsvp" ADD COLUMN     "travelMode" "EventTravelMode" NOT NULL DEFAULT 'MEETING_POINT';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "arrivalBufferMinutes" INTEGER,
ADD COLUMN     "meetingPointAddress" TEXT,
ADD COLUMN     "meetingPointName" TEXT;

-- CreateTable
CREATE TABLE "GeocodedAddress" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMeeting" (
    "eventId" TEXT NOT NULL,
    "meetingPointName" TEXT,
    "meetingPointAddress" TEXT,
    "travelMinutes" INTEGER,
    "travelMinutesManual" BOOLEAN NOT NULL DEFAULT false,
    "travelRouteKey" TEXT,
    "meetsAtOverride" TIMESTAMP(3),
    "meetingAnnouncedKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMeeting_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodedAddress_query_key" ON "GeocodedAddress"("query");

-- CreateIndex
CREATE INDEX "GeocodedAddress_lastUsedAt_idx" ON "GeocodedAddress"("lastUsedAt");

-- AddForeignKey
ALTER TABLE "EventMeeting" ADD CONSTRAINT "EventMeeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
