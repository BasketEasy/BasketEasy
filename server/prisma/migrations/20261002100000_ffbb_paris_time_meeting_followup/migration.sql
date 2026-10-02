-- Follow-up to 20260930050000_ffbb_event_paris_time. That migration moved every FFBB-imported
-- "Event"."startsAt" back by 1-2h but left the meeting data keyed to the old kick-off:
--   * "EventMeeting"."meetsAtOverride" is an absolute timestamp set against the old time, so it
--     sat 1-2h after the corrected kick-off it was meant to precede;
--   * "EventMeeting"."meetingAnnouncedKey" ends with the old meetsAt, so the next announce pass
--     would read it as a changed RDV and notify every GOING + MEETING_POINT player.
-- Both move by exactly the shift the startsAt took. That shift is recomputed from the current
-- startsAt (the old value was the same wall clock read as UTC), and applied only to rows last
-- written before that migration's commit time, so an override a manager set since is left
-- alone. A match a manager hand-corrected before #280 can't be told apart from an untouched
-- import and is not handled here.
WITH shifted AS (
  SELECT
    m."eventId",
    (((e."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') - e."startsAt") AS delta
  FROM "EventMeeting" m
  JOIN "Event" e ON e."id" = m."eventId"
  WHERE e."externalId" IS NOT NULL
    AND m."updatedAt" < TIMESTAMP '2026-09-30 12:18:51'
)
UPDATE "EventMeeting" m
SET
  "meetsAtOverride" = m."meetsAtOverride" - s.delta,
  "meetingAnnouncedKey" = CASE
    WHEN m."meetingAnnouncedKey" ~ '\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    THEN regexp_replace(
      m."meetingAnnouncedKey",
      '[^|]+$',
      to_char(
        substring(m."meetingAnnouncedKey" from '[^|]+$')::timestamp - s.delta,
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )
    ELSE m."meetingAnnouncedKey"
  END
FROM shifted s
WHERE m."eventId" = s."eventId"
  AND s.delta <> INTERVAL '0';
