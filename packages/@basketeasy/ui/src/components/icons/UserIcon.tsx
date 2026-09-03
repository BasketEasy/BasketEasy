import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/**
 * A single person (Mon profil, Mon compte) — the head-and-shoulders bust.
 * UsersIcon is the plural of this: a roster, never one account.
 */
export function UserIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2" />
    </svg>
  );
}
