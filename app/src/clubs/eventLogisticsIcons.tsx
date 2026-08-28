import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';

/**
 * Shared jersey/ball field icons — the same SVG paths back both the full
 * Logistique row (EventLogisticsSection, sized up) and the agenda's mini
 * chips (EventLogisticsMiniChips, sized down), so the two contexts never
 * drift on which icon represents which field.
 */
export function JerseyIcon({ size = 12, tone, className }: { size?: number } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
    >
      <path d="M8 3 3 7l3 3 2-1.5V20a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5L18 10l3-3-5-4-2 2h-4L8 3Z" />
    </svg>
  );
}

export function BallIcon({ size = 12, tone, className }: { size?: number } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}
