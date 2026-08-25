/**
 * Rounds `value / max` to the nearest quarter and maps it to one of a fixed
 * set of Tailwind width classes. The classes must appear as complete literal
 * strings here (not built by interpolation) so Tailwind's scanner can see
 * them — an interpolated class would silently ship an unstyled meter.
 */
export function meterWidthClass(value: number, max: number): string {
  if (max <= 0) {
    return 'w-0';
  }
  const ratio = Math.min(1, Math.max(0, value / max));
  const quarter = Math.round(ratio * 4);
  switch (quarter) {
    case 0:
      return 'w-0';
    case 1:
      return 'w-1/4';
    case 2:
      return 'w-1/2';
    case 3:
      return 'w-3/4';
    default:
      return 'w-full';
  }
}
