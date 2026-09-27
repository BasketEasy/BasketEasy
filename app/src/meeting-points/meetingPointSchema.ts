import { z } from 'zod';
import {
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type MeetingPoint,
} from '@basketeasy/types/meeting-points';

export const HALF_FILLED_ERROR = 'Renseignez le nom et l’adresse';

/**
 * The name/address pair both meeting-point forms edit (the settings dialog
 * and a match's « Ajuster »). Registered as `name` and `address` in each.
 */
export const meetingPointFields = {
  name: z.string().max(MEETING_POINT_NAME_MAX_LENGTH),
  address: z.string().max(MEETING_POINT_ADDRESS_MAX_LENGTH),
};

/**
 * Name and address travel together: both empty means "no meeting point",
 * exactly one filled is an error on the empty one rather than a silent null.
 * `required` is for a form where choosing « a place of its own » must name
 * one (a team override, a match override).
 */
export function refineMeetingPointPair(
  value: { name: string; address: string },
  ctx: z.RefinementCtx,
  { required = false }: { required?: boolean } = {},
): void {
  const hasName = value.name.trim() !== '';
  const hasAddress = value.address.trim() !== '';
  if (hasName && hasAddress) return;
  if (!hasName && !hasAddress && !required) return;
  if (!hasName) ctx.addIssue({ code: 'custom', path: ['name'], message: HALF_FILLED_ERROR });
  if (!hasAddress) ctx.addIssue({ code: 'custom', path: ['address'], message: HALF_FILLED_ERROR });
}

/** The trimmed pair as the API takes it; null when both are empty. */
export function toMeetingPoint(value: { name: string; address: string }): MeetingPoint | null {
  const name = value.name.trim();
  const address = value.address.trim();
  return name && address ? { name, address } : null;
}
