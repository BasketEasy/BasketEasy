import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { Card, CardContent } from '@basketeasy/ui/card';
import { toast } from '@basketeasy/ui/toast-store';
import type { ImportPlayersRow } from '@basketeasy/types/players';
import { usePlayerList } from '../clubs/usePlayerList';
import { usePlayerImport } from '../clubs/usePlayerImport';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { PlayerImportSteps } from '../clubs/playerImport/PlayerImportSteps';
import { PlayerImportUploadStep } from '../clubs/playerImport/PlayerImportUploadStep';
import { PlayerImportMappingStep } from '../clubs/playerImport/PlayerImportMappingStep';
import { PlayerImportPreviewStep } from '../clubs/playerImport/PlayerImportPreviewStep';
import type { ParsedSpreadsheet } from '../clubs/playerImport/parseSpreadsheet';
import type { ImportTargetField } from '../clubs/playerImport/columnMapping';
import { resolveImportRows } from '../clubs/playerImport/resolveImportRows';

type Step =
  | { name: 'upload' }
  | { name: 'map'; parsed: ParsedSpreadsheet }
  | { name: 'preview'; parsed: ParsedSpreadsheet; mapping: Partial<Record<ImportTargetField, number>> };

const STEP_INDEX: Record<Step['name'], 0 | 1 | 2> = { upload: 0, map: 1, preview: 2 };

export function PlayerImportPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ name: 'upload' });
  const [lastMapping, setLastMapping] = useState<Partial<Record<ImportTargetField, number>>>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Every step transition, forward or back, moves focus to the new step's
  // own heading. Otherwise focus stays on whatever button triggered the
  // transition (gone from the DOM in the upload -> map case, or just
  // stale), which for a screen-reader or keyboard user reads as nothing
  // having happened.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step.name]);

  const { data: allPlayersResult } = usePlayerList(clubId!, { pageSize: 1000 });
  const existingPlayers = useMemo(() => allPlayersResult?.items ?? [], [allPlayersResult]);

  const { mutate: importPlayers, isPending } = usePlayerImport(clubId!);

  const resolvedRows = useMemo(() => {
    if (step.name !== 'preview') return [];
    return resolveImportRows(step.parsed.rows, step.mapping, existingPlayers, clubId!);
  }, [step, existingPlayers, clubId]);

  const handleConfirm = () => {
    const rows: ImportPlayersRow[] = resolvedRows
      .filter(({ action }) => action.type === 'create' || action.type === 'update')
      .map(({ row }) => row);

    importPlayers(rows, {
      onSuccess: (result) => {
        toast({
          variant: 'success',
          title: 'Import terminé',
          description: `${result.created} créé(s), ${result.updated} mis à jour, ${result.conflicts} conflit(s).`,
        });
        navigate(`/clubs/${clubId}/members?tab=players`);
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: "Échec de l'import",
          description: getClubErrorMessage(err),
        }),
    });
  };

  return (
    <PageContainer size="lg">
      <Heading as="h1" size="3xl">
        Importer les licenciés
      </Heading>

      <PlayerImportSteps current={STEP_INDEX[step.name]} />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {step.name === 'upload' && (
            <PlayerImportUploadStep
              headingRef={headingRef}
              onParsed={(parsed) => setStep({ name: 'map', parsed })}
            />
          )}

          {step.name === 'map' && (
            <PlayerImportMappingStep
              parsed={step.parsed}
              initialMapping={lastMapping}
              headingRef={headingRef}
              onBack={() => setStep({ name: 'upload' })}
              onConfirm={(mapping) => {
                setLastMapping(mapping);
                setStep({ name: 'preview', parsed: step.parsed, mapping });
              }}
            />
          )}

          {step.name === 'preview' && (
            <PlayerImportPreviewStep
              resolvedRows={resolvedRows}
              isSubmitting={isPending}
              headingRef={headingRef}
              onBack={() => setStep({ name: 'map', parsed: step.parsed })}
              onConfirm={handleConfirm}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
