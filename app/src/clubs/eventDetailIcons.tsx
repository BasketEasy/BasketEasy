import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';

/**
 * The call-up glyph — a clipboard with a check. It says "the coach picked
 * you", which is a different fact from "you said you are coming", so it is
 * deliberately not a tick on its own: the two signals sit side by side on
 * every roster row and must not be confusable.
 *
 * Same shape as the icons in `eventLogisticsIcons.tsx`: the shared
 * `size` and `tone` axes, never a `text-*` class at the call site. It was
 * copy-pasted inline in three places (the event page hero, `EventRow`, the
 * mockups) before this file existed.
 */
export function ConvocationIcon({ size = 'sm', tone, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
    >
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
      <path d="M9 11.5l2 2 4-4.5" />
    </svg>
  );
}

/** The venue pin, shared by the event hero and the « S'y rendre » card. */
export function MapPinIcon({ size = 'lg', tone, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
    >
      <path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/** « Modifier le lieu »: a pencil. */
export function PencilIcon({ size = 'md', tone, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
