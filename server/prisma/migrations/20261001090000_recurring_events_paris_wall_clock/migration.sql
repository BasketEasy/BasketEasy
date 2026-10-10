-- Recurring series used to be stepped by 7 × 24 h in UTC (and the bulk
-- time-of-day edit applied one UTC hour to every row), so occurrences on the
-- far side of a DST change sat an hour off their Paris wall-clock time.
--
-- Realign the series still to come. Three rules keep this from making things
-- worse:
--   * Only rows in the future move. A played training or match carries
--     scoresheets, votes and stats keyed to the time it was played.
--   * A series' « untouched » rows are the ones sharing its most common UTC
--     time of day (the drift never changes the UTC time, a manual edit does):
--     that cohort is realigned and any row off it, moved on purpose, is left
--     alone. The earliest row is not trusted as an anchor, it may be gone or
--     already past a DST change.
--   * The Paris time the cohort is realigned to is the one it had when the
--     series was created: the UTC offset in force at the earlier of the
--     series' first `createdAt` and first remaining `startsAt`.
-- A local time that does not exist (02:30 on the spring-forward Sunday) is
-- resolved by Postgres to the next valid instant, 03:30.
--
-- Side effects that SQL can reach are kept consistent in the same statement:
-- a meeting-time override belonged to the old kick-off (same rule as a
-- kick-off edit), and a SCHEDULED WhatsApp reminder's `dueAt` moves by the
-- same amount as its event. The queued BullMQ job cannot be moved from here:
-- `WhatsAppReminderScheduler.send` ignores a job that fires before `dueAt`
-- and the sweep sends the share at the corrected time.
WITH "cohort" AS (
  SELECT DISTINCT ON ("recurrenceId")
    "recurrenceId",
    "utcTime"
  FROM (
    SELECT "recurrenceId", "startsAt"::time AS "utcTime", COUNT(*) AS "n", MIN("startsAt") AS "first"
    FROM "Event"
    WHERE "recurrenceId" IS NOT NULL
    GROUP BY "recurrenceId", "startsAt"::time
  ) AS "t"
  ORDER BY "recurrenceId", "n" DESC, "first" ASC
),
"series" AS (
  SELECT
    c."recurrenceId",
    c."utcTime",
    (
      (LEAST(MIN(e."createdAt"), MIN(e."startsAt"))::date + c."utcTime")
        AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'
    )::time AS "parisTime"
  FROM "cohort" AS c
  JOIN "Event" AS e ON e."recurrenceId" = c."recurrenceId"
  GROUP BY c."recurrenceId", c."utcTime"
),
"moves" AS (
  SELECT
    e."id",
    e."startsAt" AS "oldStartsAt",
    ((
      ((e."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date + s."parisTime"
    ) AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC' AS "newStartsAt"
  FROM "Event" AS e
  JOIN "series" AS s ON s."recurrenceId" = e."recurrenceId"
  WHERE e."startsAt" > (now() AT TIME ZONE 'UTC')
    AND e."startsAt"::time = s."utcTime"
    AND ((e."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::time <> s."parisTime"
),
"shifted" AS (
  UPDATE "Event" AS e
  SET "startsAt" = m."newStartsAt"
  FROM "moves" AS m
  WHERE e."id" = m."id" AND m."newStartsAt" <> m."oldStartsAt"
  RETURNING e."id"
),
"meetings" AS (
  UPDATE "EventMeeting"
  SET "meetsAtOverride" = NULL
  WHERE "eventId" IN (SELECT "id" FROM "shifted")
  RETURNING "eventId"
)
UPDATE "EventShare" AS sh
SET "dueAt" = sh."dueAt" + (m."newStartsAt" - m."oldStartsAt")
FROM "moves" AS m
WHERE sh."eventId" = m."id"
  AND sh."eventId" IN (SELECT "id" FROM "shifted")
  AND sh."type" = 'REMINDER'
  AND sh."state" = 'SCHEDULED'
  AND sh."dueAt" IS NOT NULL;
