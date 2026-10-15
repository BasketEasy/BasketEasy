import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { Text } from '@basketeasy/ui/text';
import { Card, CardContent } from '@basketeasy/ui/card';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Button } from '@basketeasy/ui/button';
import { toast } from '@basketeasy/ui/toast-store';
import type { ImportPlayersRow } from '@basketeasy/types/players';
import { PageBackLink, PageBar } from '../components/PageBar';
import { useClubShow } from '../clubs/useClubShow';
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
  | {
      name: 'preview';
      parsed: ParsedSpreadsheet;
      mapping: Partial<Record<ImportTargetField, number>>;
    };

const STEP_INDEX: Record<Step['name'], 0 | 1 | 2> = { upload: 0, map: 1, preview: 2 };

// Mirrors MembersPage's/TeamDetailPage's LINKING_PAGE_SIZE — capped at the
// server's MAX_PAGE_SIZE (server/src/common/dto/pagination-query.dto.ts),
// which a naive 1000 exceeds and always 400s.
const LINKING_PAGE_SIZE = 100;

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

  const {
    data: allPlayersResult,
    isLoading: isPlayersLoading,
    isError: isPlayersError,
    refetch: refetchPlayers,
    isRefetching: isPlayersRefetching,
  } = usePlayerList(clubId!, { pageSize: LINKING_PAGE_SIZE });
  const existingPlayers = useMemo(() => allPlayersResult?.items ?? [], [allPlayersResult]);

  const { data: club } = useClubShow(clubId!);
  const backTo = `/clubs/${clubId}/members?tab=players`;
  const backTitle = club ? `Effectif · ${club.name}` : 'Effectif';

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
        navigate(backTo);
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
    <>
      <PageBar to={backTo} title={backTitle} />
      <PageContainer size="lg" top="bar">
        <PageBackLink to={backTo} title={backTitle} />

        <div className="flex flex-col gap-1.5">
          {club && (
            <Text variant="eyebrow" as="p">
              {club.name}
            </Text>
          )}
          <PageHeader title="Importer les licenciés" />
        </div>

        <PlayerImportSteps current={STEP_INDEX[step.name]} />

        <Card>
          <CardContent className="flex flex-col gap-4">
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

            {step.name === 'preview' && isPlayersError && (
              <div className="flex flex-col gap-4">
                <QueryError
                  onRetry={() => refetchPlayers()}
                  isRetrying={isPlayersRefetching}
                  description="L'effectif existant n'a pas pu être chargé, nécessaire pour détecter les doublons. Vérifiez votre connexion."
                />
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => setStep({ name: 'map', parsed: step.parsed })}
                >
                  Retour
                </Button>
              </div>
            )}

            {step.name === 'preview' && !isPlayersError && isPlayersLoading && (
              <Loader>Chargement de l&apos;effectif existant…</Loader>
            )}

            {step.name === 'preview' && !isPlayersError && !isPlayersLoading && (
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
    </>
  );
}
