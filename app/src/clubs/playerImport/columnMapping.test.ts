import { describe, expect, it } from 'vitest';
import { guessColumnMapping } from './columnMapping';

describe('guessColumnMapping', () => {
  it('matches known FBI French labels case-insensitively', () => {
    const headers = [
      'N° national',
      'N° licence',
      'Nom',
      'Prénom',
      'Sexe',
      'Date de naissance',
      'Type lic.',
    ];
    const mapping = guessColumnMapping(headers);

    expect(mapping).toEqual({
      nationalId: 0,
      licenseNumber: 1,
      lastName: 2,
      firstName: 3,
      gender: 4,
      birthDate: 5,
      licenseType: 6,
    });
  });

  it('leaves a field unmapped when no header matches', () => {
    const mapping = guessColumnMapping(['Nom', 'Prénom']);

    expect(mapping.firstName).toBe(1);
    expect(mapping.lastName).toBe(0);
    expect(mapping.nationalId).toBeUndefined();
  });

  it('returns an empty mapping for an empty header list', () => {
    expect(guessColumnMapping([])).toEqual({});
  });
});
