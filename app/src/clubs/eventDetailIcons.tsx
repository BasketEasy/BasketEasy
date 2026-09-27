import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';

/**
 * The call-up glyph — a clipboard with a check. It says "the coach picked
 * you", which is a different fact from "you said you are coming", so it is
 * deliberately not a tick on its own: the two signals sit side by side on
 * every roster row and must not be confusable.
 *
 * Same shape as the icons in `eventLogisticsIcons.tsx`: a `size` in px plus
 * the shared `tone` axis, never a `text-*` class at the call site. It was
 * copy-pasted inline in three places (the event page hero, `EventRow`, the
 * mockups) before this file existed.
 */
export function ConvocationIcon({ size = 14, tone, className }: { size?: number } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
    >
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
      <path d="M9 11.5l2 2 4-4.5" />
    </svg>
  );
}

/** The venue pin, shared by the event hero and the « S'y rendre » card. */
export function MapPinIcon({ size = 18, tone, className }: { size?: number } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
    >
      <path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/** The arrival time at the gym — a clock, so it doesn't read as the meeting pin. */
export function ClockIcon({ size = 18, tone, className }: { size?: number } & IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
