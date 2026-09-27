-- CreateEnum
CREATE TYPE "EventTravelMode" AS ENUM ('MEETING_POINT', 'DIRECT');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "arrivalBufferMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "meetingPointAddress" TEXT,
ADD COLUMN     "meetingPointName" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "meetingAnnouncedKey" TEXT,
ADD COLUMN     "meetingPointAddress" TEXT,
ADD COLUMN     "meetingPointName" TEXT,
ADD COLUMN     "meetsAtOverride" TIMESTAMP(3),
ADD COLUMN     "travelMinutes" INTEGER,
ADD COLUMN     "travelMinutesManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "travelRouteKey" TEXT;

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

    CONSTRAINT "GeocodedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodedAddress_query_key" ON "GeocodedAddress"("query");
