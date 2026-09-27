import type { EventRosterRow } from '../clubs/useEventRoster';

export interface TravelCounts {
  meetingPoint: number;
  direct: number;
}

/**
 * Who comes to the meeting point and who goes direct, among the people the
 * attendance counts are about (the convoked group once one exists — same
 * scoping as `countEventRoster`) who answered GOING.
 */
export function countTravelModes(
  rows: EventRosterRow[],
  isConvocationScoped: boolean,
): TravelCounts {
  const going = rows.filter(
    (row) => row.rsvpStatus === 'GOING' && (!isConvocationScoped || row.convoked),
  );
  const direct = going.filter((row) => row.travelMode === 'DIRECT').length;
  return { meetingPoint: going.length - direct, direct };
}
