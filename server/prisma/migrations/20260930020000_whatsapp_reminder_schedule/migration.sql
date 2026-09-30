-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WHATSAPP_SHARE_REQUESTED';

-- AlterEnum
ALTER TYPE "EventShareState" ADD VALUE 'SCHEDULED';
ALTER TYPE "EventShareState" ADD VALUE 'PENDING';
ALTER TYPE "EventShareState" ADD VALUE 'EXPIRED';
ALTER TYPE "EventShareState" ADD VALUE 'VOID';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "waReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waDefaultOffsetMinutes" INTEGER NOT NULL DEFAULT 4320;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "waReminderOverride" BOOLEAN,
ADD COLUMN     "waOffsetMinutes" INTEGER;

-- AlterTable
ALTER TABLE "EventShare" ADD COLUMN     "firstNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "nudgedAt" TIMESTAMP(3),
ADD COLUMN     "dueAt" TIMESTAMP(3);
