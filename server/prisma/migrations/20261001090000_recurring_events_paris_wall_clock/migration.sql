-- Recurring series used to be stepped by 7 × 24 h in UTC (and the bulk
-- time-of-day edit applied one UTC hour to every row), so occurrences on the
-- far side of a DST change sat an hour off their Paris wall-clock time.
-- Realign them on the series' first occurrence. Only rows still at that
-- occurrence's UTC time-of-day are touched: a row whose time differs was
-- moved on purpose, one by one, and is left alone.
WITH "anchor" AS (
  SELECT DISTINCT ON ("recurrenceId")
    "recurrenceId",
    "startsAt"::time AS "utcTime",
    (("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::time AS "parisTime"
  FROM "Event"
  WHERE "recurrenceId" IS NOT NULL
  ORDER BY "recurrenceId", "startsAt" ASC
),
"shifted" AS (
  UPDATE "Event" AS e
  SET "startsAt" = (
    (
      (("e"."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date + "a"."parisTime"
    ) AT TIME ZONE 'Europe/Paris'
  ) AT TIME ZONE 'UTC'
  FROM "anchor" AS a
  WHERE "e"."recurrenceId" = "a"."recurrenceId"
    AND "e"."startsAt"::time = "a"."utcTime"
    AND (("e"."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::time <> "a"."parisTime"
  RETURNING "e"."id"
)
-- Same rule as a kick-off edit: a meeting-time override belonged to the old one.
UPDATE "EventMeeting"
SET "meetsAtOverride" = NULL
WHERE "eventId" IN (SELECT "id" FROM "shifted");
