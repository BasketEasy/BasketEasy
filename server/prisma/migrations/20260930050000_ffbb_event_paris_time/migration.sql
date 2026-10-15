-- FFBB-imported kick-offs were stored as if FFBB's offset-less Paris time were UTC,
-- so every one reads 1-2h late. Reinterpret the stored wall clock as Europe/Paris.
-- Fixing it here, not on the next re-sync, keeps that re-sync from announcing every
-- match as rescheduled, and covers played matches the import no longer touches.
UPDATE "Event"
SET "startsAt" = ("startsAt" AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
WHERE "externalId" IS NOT NULL;
