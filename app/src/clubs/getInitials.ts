/**
 * "Alex" + "Dupont" -> "AD". AvatarFallback (from @basketeasy/ui/avatar)
 * takes children, not a name prop, so callers build the initials string
 * themselves.
 */
export function getInitials(firstName: string, lastName: string): string {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
  return initials || '?';
}
