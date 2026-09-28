/**
 * Escapes LIKE/ILIKE metacharacters in user input.
 *
 * Prisma parameterises every value, so there is no SQL injection, but it
 * sends `contains` and case-insensitive `equals` to Postgres as ILIKE with
 * the value used as the pattern, unescaped. A `%` or `_` in a search would
 * then be a wildcard: « a%@example.fr » turns SUPPORT's exact-e-mail lookup
 * into a prefix probe that rebuilds a redacted address one character at a
 * time. Backslash is Postgres's default LIKE escape character.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
