import { describe, expect, it } from 'vitest';
import { resolveRouteSeo } from './routeSeo';

describe('resolveRouteSeo', () => {
  it.each(['/', '/register', '/cgu', '/confidentialite', '/mentions-legales', '/cgu/'])(
    'indexes %s',
    (path) => {
      expect(resolveRouteSeo(path).index).toBe(true);
    },
  );

  it.each(['/dashboard', '/login', '/invite/abc', '/r/abc', '/admin/users', '/nope'])(
    'noindexes %s',
    (path) => {
      expect(resolveRouteSeo(path).index).toBe(false);
    },
  );
});
