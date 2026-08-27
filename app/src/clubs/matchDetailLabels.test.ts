import { describe, expect, it } from 'vitest';
import { teamAvatarInitials } from './matchDetailLabels';

describe('teamAvatarInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(teamAvatarInitials('AS Basket Nantes')).toBe('AB');
  });

  it('handles a single-word name', () => {
    expect(teamAvatarInitials('Seniors')).toBe('S');
  });

  it('falls back to ? for an empty name', () => {
    expect(teamAvatarInitials('  ')).toBe('?');
  });
});
