export type ImportTargetField =
  | 'firstName'
  | 'lastName'
  | 'nationalId'
  | 'licenseNumber'
  | 'birthDate'
  | 'gender'
  | 'licenseType';

export const IMPORT_TARGET_FIELDS: {
  field: ImportTargetField;
  label: string;
  required: boolean;
}[] = [
  { field: 'firstName', label: 'Prénom', required: true },
  { field: 'lastName', label: 'Nom', required: true },
  { field: 'nationalId', label: 'N° national', required: false },
  { field: 'licenseNumber', label: 'N° licence', required: false },
  { field: 'birthDate', label: 'Date de naissance', required: false },
  { field: 'gender', label: 'Sexe', required: false },
  { field: 'licenseType', label: 'Type de licence', required: false },
];

// Known FBI/near-universal French header labels per target field, lowercased.
// Matched by exact (case/accent-insensitive) comparison, not substring, to
// avoid a field like "Nom de naissance" being mistaken for "Nom".
const KNOWN_LABELS: Record<ImportTargetField, string[]> = {
  firstName: ['prenom', 'prénom'],
  lastName: ['nom', 'nom*'],
  nationalId: ['n national', 'n° national', 'no national'],
  licenseNumber: ['n licence', 'n° licence', 'no licence'],
  birthDate: ['date de naissance'],
  gender: ['sexe'],
  licenseType: ['type lic.', 'type lic', 'type de licence'],
};

function normalize(header: string): string {
  return header.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function guessColumnMapping(headers: string[]): Partial<Record<ImportTargetField, number>> {
  const normalized = headers.map(normalize);
  const mapping: Partial<Record<ImportTargetField, number>> = {};

  for (const { field } of IMPORT_TARGET_FIELDS) {
    const labels = KNOWN_LABELS[field].map(normalize);
    const index = normalized.findIndex((h) => labels.includes(h));
    if (index !== -1) {
      mapping[field] = index;
    }
  }

  return mapping;
}
