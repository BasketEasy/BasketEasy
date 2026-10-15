import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** People / roster (Membres, Joueurs, Effectif). */
export function UsersIcon({ size, tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
      {...props}
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 8.5a2.5 2.5 0 1 0-1-4.8" />
      <path d="M15 13.2c2.5.3 4.5 2.1 5.5 4.8" />
    </svg>
  );
}
