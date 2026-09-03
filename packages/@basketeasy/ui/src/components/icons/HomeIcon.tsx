import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** Home / landing screen (Ma semaine, Accueil) — the bottom bar's first tab. */
export function HomeIcon({ tone, className, ...props }: IconProps) {
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
      <path d="M4 20h16V9l-8-5-8 5v11" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}
