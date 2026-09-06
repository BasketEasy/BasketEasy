import { describe, expect, it } from 'vitest';
import { isMinorBirthDate } from '@basketeasy/types/parental-consent';
import { defaultAttesterName } from './parentalConsentCopy';

describe('isMinorBirthDate', () => {
  const on = new Date('2026-09-06T00:00:00.000Z');

  it('treats a missing birth date as not a minor — nothing to require consent for', () => {
    expect(isMinorBirthDate(null, on)).toBe(false);
    expect(isMinorBirthDate(undefined, on)).toBe(false);
    expect(isMinorBirthDate('', on)).toBe(false);
  });

  it('ignores an unparseable date rather than blocking the form', () => {
    expect(isMinorBirthDate('not-a-date', on)).toBe(false);
  });

  it('is true the day before the eighteenth birthday and false on it', () => {
    expect(isMinorBirthDate('2008-09-07', on)).toBe(true);
    expect(isMinorBirthDate('2008-09-06', on)).toBe(false);
  });

  it('accepts both a date-only string and the API’s full timestamp', () => {
    expect(isMinorBirthDate('2015-04-03', on)).toBe(true);
    expect(isMinorBirthDate('2015-04-03T00:00:00.000Z', on)).toBe(true);
  });
});

describe('defaultAttesterName', () => {
  it('joins the signed-in admin’s name', () => {
    expect(defaultAttesterName({ firstName: 'Marie', lastName: 'Durand' })).toBe('Marie Durand');
  });

  it('copes with a half-filled or absent profile', () => {
    expect(defaultAttesterName({ firstName: 'Marie', lastName: null })).toBe('Marie');
    expect(defaultAttesterName(null)).toBe('');
  });
});
