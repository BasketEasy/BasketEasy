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

  // A leap-day birth date plus eighteen years lands on a 29 February that does
  // not exist, which Date rolls forward to 1 March unless the day is clamped.
  it('treats 28 February as the eighteenth birthday of a 29 February baby', () => {
    expect(isMinorBirthDate('2008-02-29', new Date('2026-02-27T12:00:00.000Z'))).toBe(true);
    expect(isMinorBirthDate('2008-02-29', new Date('2026-02-28T12:00:00.000Z'))).toBe(false);
    expect(isMinorBirthDate('2008-02-29', new Date('2026-03-01T12:00:00.000Z'))).toBe(false);
  });

  it('leaves every other birth date on its own anniversary', () => {
    expect(isMinorBirthDate('2008-02-28', new Date('2026-02-27T12:00:00.000Z'))).toBe(true);
    expect(isMinorBirthDate('2008-02-28', new Date('2026-02-28T12:00:00.000Z'))).toBe(false);
    expect(isMinorBirthDate('2008-03-01', new Date('2026-02-28T12:00:00.000Z'))).toBe(true);
    expect(isMinorBirthDate('2008-01-31', new Date('2026-01-31T00:00:00.000Z'))).toBe(false);
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
