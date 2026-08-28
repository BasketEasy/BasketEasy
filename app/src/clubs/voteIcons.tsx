import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';

/**
 * The "joueur en difficulté" shield outline (`Vote.dc.html:132`) — a
 * distinct silhouette from the shared ShieldIcon (used for team-admin
 * badges elsewhere), so kept local to this feature rather than forcing a
 * pixel mismatch onto a semantically unrelated shared icon, same precedent
 * as eventLogisticsIcons.tsx's feature-scoped JerseyIcon/BallIcon.
 */
export function WorstIcon({ size = 18, tone, className }: { size?: number } & IconProps) {
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
      <path d="M12 21c-4-1.5-7-4.5-7-9V6l7-3 7 3v6c0 4.5-3 7.5-7 9Z" />
    </svg>
  );
}
