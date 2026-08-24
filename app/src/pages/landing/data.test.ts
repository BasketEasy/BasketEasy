import { describe, expect, it } from 'vitest';
import { BENTO_FEATURES, SANDBOX_ROSTER } from './data';

describe('landing data', () => {
  it('has exactly 4 bento features, matching the bento grid layout', () => {
    expect(BENTO_FEATURES).toHaveLength(4);
  });

  it('badges only the two not-yet-built bento features', () => {
    const badged = BENTO_FEATURES.filter((feature) => feature.badge);
    expect(badged).toHaveLength(2);
    expect(badged.every((feature) => feature.badge === 'Bientôt')).toBe(true);
  });

  it('has a 3-player sample roster with at least one present and one absent', () => {
    expect(SANDBOX_ROSTER).toHaveLength(3);
    expect(SANDBOX_ROSTER.some((player) => player.status === 'present')).toBe(true);
    expect(SANDBOX_ROSTER.some((player) => player.status === 'absent')).toBe(true);
  });
});
