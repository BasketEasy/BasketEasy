-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT', 'DATA_OFFICER');

-- AlterEnum
-- The back-office's own event types, added to the AuditEventType the data
-- retention policy created in 20260906000000_add_data_retention. Postgres 12+
-- allows ADD VALUE inside a transaction as long as the new value is not used
-- in that same transaction; nothing here writes a row, so this is safe under
-- Prisma's per-migration transaction.
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_LOGIN_SUCCESS';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_LOGIN_FAILURE';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_PII_VIEWED';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_USER_ERASED';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_EXPORT_GENERATED';

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "totpSecret" TEXT,
    "allowedCidrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lockedUntil" TIMESTAMP(3),
    "lastUsedTotpCounter" INTEGER,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
