-- RenameEnum
ALTER TYPE "TeamGender" RENAME TO "Gender";

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "licenseType" TEXT,
ADD COLUMN     "nationalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_nationalId_key" ON "Player"("nationalId");
