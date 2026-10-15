-- CreateEnum
CREATE TYPE "TeamCategory" AS ENUM ('U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS');

-- CreateEnum
CREATE TYPE "TeamGender" AS ENUM ('MEN', 'WOMEN');

-- AlterTable: add gender, backfilling existing rows to MEN before making it required
ALTER TABLE "Team" ADD COLUMN "gender" "TeamGender";
UPDATE "Team" SET "gender" = 'MEN' WHERE "gender" IS NULL;
ALTER TABLE "Team" ALTER COLUMN "gender" SET NOT NULL;

-- AlterTable: convert category to enum, backfilling unmapped legacy free-text values to SENIORS
ALTER TABLE "Team" ALTER COLUMN "category" TYPE "TeamCategory" USING (
  CASE
    WHEN "category" IN ('U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS') THEN "category"::"TeamCategory"
    ELSE 'SENIORS'::"TeamCategory"
  END
);
ALTER TABLE "Team" ALTER COLUMN "category" SET NOT NULL;
