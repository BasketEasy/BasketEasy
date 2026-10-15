/*
  Warnings:

  - Added the required column `clubId` to the `Player` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "clubId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Player_clubId_idx" ON "Player"("clubId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
