import { useRef, useState, type DragEvent, type RefObject } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Loader } from '@basketeasy/ui/loader';
import { cn } from '@basketeasy/ui/cn';
import {
  parseSpreadsheet,
  SpreadsheetParseError,
  type ParsedSpreadsheet,
} from './parseSpreadsheet';
import { Text } from '@basketeasy/ui/text';

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

export function PlayerImportUploadStep({
  headingRef,
  onParsed,
}: {
  headingRef: RefObject<HTMLHeadingElement>;
  onParsed: (parsed: ParsedSpreadsheet) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setIsParsing(true);
    try {
      const parsed = await parseSpreadsheet(file);
      onParsed(parsed);
    } catch (err) {
      setError(err instanceof SpreadsheetParseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-bold text-charcoal outline-none"
      >
        Importer le fichier
      </h2>
      <Text variant="meta">
        Sélectionnez l&apos;export FBI (Éditions → export Excel) ou tout fichier .csv/.xlsx listant
        vos licenciés.
      </Text>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!isParsing) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={isParsing ? undefined : handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          isDragOver ? 'border-orange-text bg-orange-tint' : 'border-border-strong bg-surface-2',
        )}
      >
        {isParsing ? (
          <Loader>Analyse du fichier…</Loader>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-8 w-8 text-muted"
            >
              <path d="M12 16V4M12 4 7.5 8.5M12 4l4.5 4.5" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <Text variant="meta">Glissez-déposez le fichier ici, ou</Text>
            <Button type="button" onClick={() => inputRef.current?.click()}>
              Choisir un fichier
            </Button>
            <Text variant="meta" size="xs">
              Formats acceptés : .csv, .xls, .xlsx
            </Text>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="sr-only"
        aria-label="Choisir un fichier à importer"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
