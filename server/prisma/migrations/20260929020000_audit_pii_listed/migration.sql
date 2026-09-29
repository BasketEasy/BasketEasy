-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_PII_LISTED';

-- AlterTable
ALTER TABLE "RetentionRun" ADD COLUMN     "triggeredByUserId" TEXT;
