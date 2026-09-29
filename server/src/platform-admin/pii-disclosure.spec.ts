import { collectDisclosedPeople } from './pii-disclosure';

describe('collectDisclosedPeople', () => {
  it('finds person refs and search hits at any depth, once each', () => {
    const response = {
      items: [
        { person: { kind: 'user', id: 'u1', displayName: 'A B', redacted: false } },
        { person: { kind: 'user', id: 'u1', displayName: 'A B', redacted: false } },
      ],
      roster: [
        {
          player: { kind: 'player', id: 'p1' },
          linkedUser: { kind: 'user', id: 'u2' },
          club: { id: 'club-1', name: 'BC' },
        },
      ],
      groups: { club: [{ kind: 'club', id: 'club-2' }], player: [{ kind: 'player', id: 'p2' }] },
    };

    expect(collectDisclosedPeople(response)).toEqual({
      disclosedUserIds: ['u1', 'u2'],
      disclosedPlayerIds: ['p1', 'p2'],
    });
  });
});
