import { WA_OFFSET_MINUTES_MAX, WA_OFFSET_MINUTES_MIN } from '@basketeasy/types/whatsapp-reminder';

export type OffsetUnit = 'hours' | 'days';

const UNIT_MINUTES: Record<OffsetUnit, number> = { hours: 60, days: 1440 };

export const OFFSET_UNIT_OPTIONS: Array<{ value: OffsetUnit; label: string }> = [
  { value: 'hours', label: 'heures' },
  { value: 'days', label: 'jours' },
];

/** The form shows minutes as a number and a unit: whole days when it is, hours otherwise. */
export function minutesToParts(minutes: number): { value: string; unit: OffsetUnit } {
  if (minutes % UNIT_MINUTES.days === 0) {
    return { value: String(minutes / UNIT_MINUTES.days), unit: 'days' };
  }
  return { value: String(Math.round((minutes / UNIT_MINUTES.hours) * 10) / 10), unit: 'hours' };
}

/** `null` for an empty field: no override, the team's offset applies. */
export function partsToMinutes(value: string, unit: OffsetUnit): number | null {
  if (value.trim() === '') return null;
  return Math.round(Number(value.replace(',', '.')) * UNIT_MINUTES[unit]);
}

/** « 3 jours avant », « 1 heure avant ». */
export function describeOffset(minutes: number): string {
  const { value, unit } = minutesToParts(minutes);
  const plural = Number(value) > 1;
  const word = unit === 'days' ? (plural ? 'jours' : 'jour') : plural ? 'heures' : 'heure';
  return `${value} ${word} avant`;
}

/** An error message for a value outside the guest page's window, or null when it is fine. */
export function offsetError(value: string, unit: OffsetUnit): string | null {
  if (value.trim() === '') return null;
  const minutes = partsToMinutes(value, unit);
  if (minutes === null || !Number.isFinite(minutes)) return 'Durée invalide';
  if (minutes < WA_OFFSET_MINUTES_MIN) return 'Au moins 1 heure avant';
  if (minutes > WA_OFFSET_MINUTES_MAX) return '14 jours avant au maximum';
  return null;
}
