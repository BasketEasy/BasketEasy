import { describe, expect, it } from 'vitest';
import { describeOffset, minutesToParts, offsetError, partsToMinutes } from './reminderOffset';

describe('reminderOffset', () => {
  it.each([
    [4320, '3', 'days'],
    [1440, '1', 'days'],
    [180, '3', 'hours'],
    [90, '1.5', 'hours'],
    [60, '1', 'hours'],
  ] as const)('%i minutes reads as %s %s', (minutes, value, unit) => {
    expect(minutesToParts(minutes)).toEqual({ value, unit });
    expect(partsToMinutes(value, unit)).toBe(minutes);
  });

  it('an empty field is « no override »', () => {
    expect(partsToMinutes('  ', 'days')).toBeNull();
  });

  it('accepts a decimal comma', () => {
    expect(partsToMinutes('1,5', 'hours')).toBe(90);
  });

  it('describes the offset in French with the right plural', () => {
    expect(describeOffset(4320)).toBe('3 jours avant');
    expect(describeOffset(1440)).toBe('1 jour avant');
    expect(describeOffset(60)).toBe('1 heure avant');
    expect(describeOffset(180)).toBe('3 heures avant');
  });

  it('bounds the offset to 1 hour .. 14 days, the guest page’s window', () => {
    expect(offsetError('', 'days')).toBeNull();
    expect(offsetError('59', 'hours')).toBeNull();
    expect(offsetError('30', 'hours')).toBeNull();
    expect(offsetError('0.5', 'hours')).toBe('Au moins 1 heure avant');
    expect(offsetError('14', 'days')).toBeNull();
    expect(offsetError('15', 'days')).toBe('14 jours avant au maximum');
    expect(offsetError('abc', 'days')).toBe('Durée invalide');
  });
});
