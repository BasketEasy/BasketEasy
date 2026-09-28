import { emailDomainOf, initialsOf, playerRef, redactName, userRef } from './redaction';

const user = {
  id: 'user-1',
  email: 'jean.dupont@example.org',
  firstName: 'Jean',
  lastName: 'Dupont',
};
const player = {
  id: 'player-1',
  firstName: 'Élodie',
  lastName: 'Lemoine',
  user: { email: 'elodie.lemoine@example.org' },
};

describe('redaction', () => {
  it('gives SUPPORT nothing that identifies the person', () => {
    const serialised = JSON.stringify([
      userRef('SUPPORT', user),
      playerRef('SUPPORT', player),
      redactName('SUPPORT', 'Sophie Martin'),
    ]);

    for (const secret of [
      'Jean',
      'Dupont',
      'jean.dupont',
      'Élodie',
      'Lemoine',
      'elodie',
      'Sophie',
      'Martin',
    ]) {
      expect(serialised).not.toContain(secret);
    }
    expect(userRef('SUPPORT', user)).toEqual({
      kind: 'user',
      id: 'user-1',
      displayName: 'J. D.',
      email: null,
      emailDomain: 'example.org',
      redacted: true,
    });
    expect(playerRef('SUPPORT', player).displayName).toBe('É. L.');
  });

  it('gives DATA_OFFICER the full record', () => {
    expect(userRef('DATA_OFFICER', user)).toEqual({
      kind: 'user',
      id: 'user-1',
      displayName: 'Jean Dupont',
      email: 'jean.dupont@example.org',
      emailDomain: 'example.org',
      redacted: false,
    });
    expect(playerRef('DATA_OFFICER', player).email).toBe('elodie.lemoine@example.org');
    expect(redactName('DATA_OFFICER', 'Sophie Martin')).toBe('Sophie Martin');
  });

  it('falls back to the e-mail for a DATA_OFFICER when no name is set, and to a dash for SUPPORT', () => {
    const nameless = { ...user, firstName: null, lastName: null };
    expect(userRef('DATA_OFFICER', nameless).displayName).toBe('jean.dupont@example.org');
    expect(userRef('SUPPORT', nameless).displayName).toBe('—');
  });

  it('handles a player with no account', () => {
    expect(playerRef('DATA_OFFICER', { ...player, user: null })).toMatchObject({
      email: null,
      emailDomain: null,
    });
  });

  it('builds initials from whatever parts are known', () => {
    expect(initialsOf({ firstName: 'jean', lastName: null })).toBe('J.');
    expect(initialsOf({ firstName: '  ', lastName: null })).toBe('—');
    expect(redactName('SUPPORT', 'Jean-Pierre de la Tour')).toBe('J. D.');
  });

  it('keeps only the domain of an address', () => {
    expect(emailDomainOf('a.b@club.fr')).toBe('club.fr');
    expect(emailDomainOf('not-an-address')).toBe('');
  });
});
