-- DropForeignKey
ALTER TABLE "ClubMembership" DROP CONSTRAINT "ClubMembership_clubId_fkey";

-- DropForeignKey
ALTER TABLE "ClubTeam" DROP CONSTRAINT "ClubTeam_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_clubId_fkey";

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTeam" ADD CONSTRAINT "ClubTeam_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
