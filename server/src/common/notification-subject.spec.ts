import { convocationSentence, forWhomPrefix, subjectLabel } from './notification-subject';

const kids = (...names: string[]) => names.map((firstName) => ({ firstName }));

describe('notification subject', () => {
  it('phrases the convocation for every mix of reader and children', () => {
    expect(convocationSentence({ self: true, children: [] })).toBe('Vous êtes convoqué·e');
    expect(convocationSentence({ self: false, children: kids('Léo') })).toBe('Léo est convoqué·e');
    expect(convocationSentence({ self: true, children: kids('Léo') })).toBe(
      'Léo et vous êtes convoqué·es',
    );
    expect(convocationSentence({ self: false, children: kids('Emma', 'Léo') })).toBe(
      'Emma et Léo sont convoqué·es',
    );
    expect(convocationSentence({ self: false, children: kids('Emma', 'Léo', 'Noé') })).toBe(
      'Emma, Léo et Noé sont convoqué·es',
    );
  });

  it('prefixes copy not phrased around the reader, and leaves the reader alone untouched', () => {
    expect(forWhomPrefix({ self: true, children: [] })).toBe('');
    expect(forWhomPrefix({ self: false, children: kids('Léo') })).toBe('Pour Léo : ');
    expect(forWhomPrefix({ self: true, children: kids('Léo') })).toBe('Pour Léo et vous : ');
  });

  it('tags only notifications about someone other than the reader', () => {
    expect(subjectLabel({ self: true, children: kids('Léo') })).toBeNull();
    expect(subjectLabel({ self: false, children: kids('Emma', 'Léo') })).toBe('Emma et Léo');
  });
});
