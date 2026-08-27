/**
 * "U15 Filles" -> "UF" (first letter of up to the first two words), for the
 * event detail hero's team avatar fallback (both MATCH and TRAINING) — team
 * names don't carry a first/last-name pair the way getInitials expects, so
 * this is a distinct helper rather than a reuse of it.
 */
export function teamAvatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return initials || '?';
}
