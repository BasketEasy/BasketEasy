-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('COACH', 'PLAYER');

-- AlterTable
ALTER TABLE "TeamPlayer" ADD COLUMN     "role" "TeamMemberRole" NOT NULL DEFAULT 'PLAYER';

-- CreateTable
CREATE TABLE "TeamAdmin" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamAdmin_userId_idx" ON "TeamAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAdmin_teamId_userId_key" ON "TeamAdmin"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "TeamAdmin" ADD CONSTRAINT "TeamAdmin_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAdmin" ADD CONSTRAINT "TeamAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
