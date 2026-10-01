-- CreateEnum
CREATE TYPE "EventRsvpVia" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "EventShareType" AS ENUM ('REMINDER');

-- CreateEnum
CREATE TYPE "EventShareState" AS ENUM ('SENT');

-- CreateEnum
CREATE TYPE "EventSharePlatform" AS ENUM ('SHARE_SHEET', 'WA_ME', 'COPY');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "waReminderTemplate" TEXT;

-- AlterTable
ALTER TABLE "EventRsvpChange" ADD COLUMN     "via" "EventRsvpVia";

-- CreateTable
CREATE TABLE "EventShare" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "EventShareType" NOT NULL,
    "state" "EventShareState" NOT NULL,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "platform" "EventSharePlatform",
    "sentContentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventShare_eventId_type_key" ON "EventShare"("eventId", "type");

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShare" ADD CONSTRAINT "EventShare_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
