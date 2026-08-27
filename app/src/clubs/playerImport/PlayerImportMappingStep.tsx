import { useState, type RefObject } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@basketeasy/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import type { ParsedSpreadsheet } from './parseSpreadsheet';
import { IMPORT_TARGET_FIELDS, guessColumnMapping, type ImportTargetField } from './columnMapping';

const UNMAPPED = '__unmapped__';
const SAMPLE_ROW_COUNT = 2;
const REQUIRED_ALERT_ID = 'player-import-mapping-required';

function sampleValues(parsed: ParsedSpreadsheet, columnIndex: number | undefined): string {
  if (columnIndex === undefined) return '—';
  const values = parsed.rows
    .slice(0, SAMPLE_ROW_COUNT)
    .map((row) => row[columnIndex]?.trim())
    .filter((value): value is string => !!value);
  return values.length > 0 ? values.join(', ') : '—';
}

export function PlayerImportMappingStep({
  parsed,
  initialMapping,
  headingRef,
  onBack,
  onConfirm,
}: {
  parsed: ParsedSpreadsheet;
  /** Restores the previous choice when the admin comes back from the preview step. */
  initialMapping?: Partial<Record<ImportTargetField, number>>;
  headingRef: RefObject<HTMLHeadingElement>;
  onBack: () => void;
  onConfirm: (mapping: Partial<Record<ImportTargetField, number>>) => void;
}) {
  const [mapping, setMapping] = useState(
    () => initialMapping ?? guessColumnMapping(parsed.headers),
  );

  const columnOptions = parsed.headers.map((header, index) => ({
    value: String(index),
    label: header || `Colonne ${index + 1}`,
  }));

  const missingRequired = IMPORT_TARGET_FIELDS.filter(
    ({ field, required }) => required && mapping[field] === undefined,
  );
  const isValid = missingRequired.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-bold text-charcoal outline-none"
      >
        Faire correspondre les colonnes
      </h2>
      <p className="text-sm text-muted">
        Associez chaque champ à une colonne du fichier. Seuls Prénom et Nom sont obligatoires,
        laissez les autres champs non mappés si le fichier ne les contient pas.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Champ</TableHead>
              <TableHead>Colonne source</TableHead>
              <TableHead>Aperçu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {IMPORT_TARGET_FIELDS.map(({ field, label, required }) => {
              const columnIndex = mapping[field];
              const isMissing = required && columnIndex === undefined;
              return (
                <TableRow key={field}>
                  <TableCell className="font-medium text-charcoal">
                    {label}
                    {required && (
                      <span className="text-orange-text" aria-hidden="true">
                        {' '}
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={columnIndex !== undefined ? String(columnIndex) : UNMAPPED}
                      onValueChange={(value) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: value === UNMAPPED ? undefined : Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label={`Colonne source pour ${label}`}
                        aria-invalid={isMissing}
                        aria-describedby={isMissing ? REQUIRED_ALERT_ID : undefined}
                        className={isMissing ? 'border-error' : undefined}
                      >
                        <SelectValue placeholder="Non mappé" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED}>Non mappé</SelectItem>
                        {columnOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted">
                    {sampleValues(parsed, columnIndex)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {!isValid && (
        <Alert id={REQUIRED_ALERT_ID} variant="destructive">
          <AlertDescription>
            {missingRequired.map(({ label }) => label).join(' et ')}{' '}
            {missingRequired.length > 1 ? 'doivent' : 'doit'} être mappé
            {missingRequired.length > 1 ? 's' : ''} pour continuer.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Retour
        </Button>
        <Button type="button" disabled={!isValid} onClick={() => onConfirm(mapping)}>
          Continuer
        </Button>
      </div>
    </div>
  );
}
