-- CreateEnum
CREATE TYPE "EventVenue" AS ENUM ('HOME', 'AWAY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "venue" "EventVenue";
