import { escapeLike } from './like-pattern';
import { userSearchWhere } from './platform-admin-browse.service';

describe('escapeLike', () => {
  it('escapes both wildcards and the escape character itself', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('leaves an ordinary address untouched', () => {
    expect(escapeLike('jean.dupont@example.fr')).toBe('jean.dupont@example.fr');
  });

  it('keeps SUPPORT’s exact-e-mail lookup exact: a wildcard is matched literally', () => {
    expect(userSearchWhere('SUPPORT', 'a%@example.fr')).toEqual({
      email: { equals: 'a\\%@example.fr', mode: 'insensitive' },
    });
  });
});
