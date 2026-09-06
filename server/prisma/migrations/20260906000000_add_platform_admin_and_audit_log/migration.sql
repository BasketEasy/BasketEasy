-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT', 'DATA_OFFICER');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'REFRESH_TOKEN_REUSE_DETECTED', 'EMAIL_VERIFIED', 'ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILURE', 'ADMIN_PII_VIEWED', 'ADMIN_USER_ERASED', 'ADMIN_EXPORT_GENERATED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "totpSecret" TEXT,
    "allowedCidrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lockedUntil" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "userId" TEXT,
    "actorEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "summary" JSONB NOT NULL,
    "triggeredByUserId" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_type_createdAt_idx" ON "AuditLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionRun_ranAt_idx" ON "RetentionRun"("ranAt");

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
