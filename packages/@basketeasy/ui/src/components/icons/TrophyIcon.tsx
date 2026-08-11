import { type SVGProps } from 'react';

/** Teams (Équipes, Mes équipes). */
export function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M9.5 16h5l.5 4h-6l.5-4Z" />
    </svg>
  );
}
