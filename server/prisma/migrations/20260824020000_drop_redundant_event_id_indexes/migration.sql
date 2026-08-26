-- Drop indexes made redundant by the eventId-leading composite unique
-- constraint already on each table (EventRsvp_eventId_teamPlayerId_key,
-- EventConvocation_eventId_teamPlayerId_key), which already serves any
-- eventId-only lookup as a btree prefix scan. Keeping the extra index only
-- doubled write amplification on every RSVP/convocation upsert with no
-- query it uniquely served.
-- DropIndex
DROP INDEX "EventRsvp_eventId_idx";

-- DropIndex
DROP INDEX "EventConvocation_eventId_idx";
