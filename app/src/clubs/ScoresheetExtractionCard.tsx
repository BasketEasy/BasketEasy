import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { iconVariants, type IconProps } from '@basketeasy/ui/icon-variants';
import { Input } from '@basketeasy/ui/input';
import { Check } from '@basketeasy/ui/icons/check';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type {
  ParsedScoresheetData,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import type { TeamEvent } from '@basketeasy/types/events';
import { getClubErrorMessage } from './clubErrorMessages';
import { formatEventDate } from './eventDateFormat';
import {
  findMissingPlayerFields,
  findQuarterMismatches,
  type MissingPlayerField,
  type QuarterMismatch,
} from './scoresheetConsistency';
import { useConfirmEventScoresheetExtraction } from './useConfirmEventScoresheetExtraction';

// One-off icon, only used within this file — a pencil glyph marking a cell as
// editable, matching the mockup's flagged-field affordance.
function PencilIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function WarningIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function matchupLabel(event: TeamEvent): string {
  return event.opponentName ? `vs ${event.opponentName}` : 'Match';
}

function formatConfidence(confidence: number | null): string | null {
  if (confidence === null) return null;
  return `${Math.round(confidence * 100)}% de confiance`;
}

/** Deep-enough equality for two ParsedScoresheetData objects — cheap, not a hot path. */
function isSameParsedData(a: ParsedScoresheetData, b: ParsedScoresheetData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function StatusBadge({ extraction }: { extraction: ScoresheetExtraction }) {
  const confidenceLabel = formatConfidence(extraction.confidence);
  if (extraction.status === 'NEEDS_REVIEW') {
    return (
      <Badge variant="soft" tone="accent" size="md" className="w-fit gap-1.5">
        <WarningIcon className="h-3.5 w-3.5" />
        {confidenceLabel ? `${confidenceLabel} · à vérifier` : 'À vérifier'}
      </Badge>
    );
  }
  if (extraction.status === 'CONFIRMED') {
    return (
      <Badge variant="outline" tone="success" size="md" className="w-fit gap-1.5">
        <Check className="h-3.5 w-3.5" />
        Données validées
      </Badge>
    );
  }
  return (
    <Badge variant="soft" tone="structure" size="md" className="w-fit gap-1.5">
      <Check className="h-3.5 w-3.5" />
      {confidenceLabel}
    </Badge>
  );
}

function BoxScore({ data, event }: { data: ParsedScoresheetData; event: TeamEvent }) {
  const homeLabel = event.venue === 'AWAY' ? (event.opponentName ?? 'Extérieur') : 'Mon équipe';
  const awayLabel = event.venue === 'AWAY' ? 'Mon équipe' : (event.opponentName ?? 'Extérieur');
  return (
    <Card variant="inset" className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text variant="eyebrow" size="xs">
          Domicile
        </Text>
        <Text variant="label" size="sm" className="truncate">
          {homeLabel}
        </Text>
      </div>
      <Text variant="display" size="3xl" className="px-2 tabular-nums">
        {data.homeScore ?? '–'}
      </Text>
      <Text variant="body" size="lg" tone="secondary">
        &ndash;
      </Text>
      <Text variant="display" size="3xl" className="px-2 tabular-nums">
        {data.awayScore ?? '–'}
      </Text>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-right">
        <Text variant="eyebrow" size="xs">
          Extérieur
        </Text>
        <Text variant="label" size="sm" className="truncate">
          {awayLabel}
        </Text>
      </div>
    </Card>
  );
}

/**
 * A plain stat value, except for a flagged cell — a quarter-sum mismatch or
 * a missing player stat — which either gets a compact inline number input
 * (when `editable`, i.e. the viewer is a manager) or stays read-only but
 * still visually flagged (gold/bold) for a non-manager viewer.
 */
function FlaggedNumberCell({
  value,
  onChange,
  flagged,
  editable,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  flagged: boolean;
  editable: boolean;
}) {
  if (!flagged) {
    return (
      <Text as="span" variant="body" size="sm" className="tabular-nums">
        {value ?? '?'}
      </Text>
    );
  }
  if (!editable) {
    return (
      <Text as="span" variant="body" size="sm" tone="accent" className="tabular-nums font-bold">
        {value ?? '?'}
      </Text>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1 rounded-md border-2 border-gold bg-surface px-1">
      <Input
        type="number"
        aria-label="Valeur à corriger"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="h-7 w-12 border-0 bg-transparent p-0 text-center text-sm tabular-nums focus-visible:outline-none md:h-7 md:text-sm"
      />
      <PencilIcon tone="accent" className="h-3 w-3 shrink-0" />
    </div>
  );
}

function QuarterScoreTable({
  data,
  mismatches,
  event,
  canManage,
  onChange,
}: {
  data: ParsedScoresheetData;
  mismatches: QuarterMismatch[];
  event: TeamEvent;
  canManage: boolean;
  onChange: (quarterIndex: number, side: 'home' | 'away', value: number | null) => void;
}) {
  const homeLabel = event.venue === 'AWAY' ? (event.opponentName ?? 'Extérieur') : 'Mon équipe';
  const awayLabel = event.venue === 'AWAY' ? 'Mon équipe' : (event.opponentName ?? 'Extérieur');
  const flaggedSides = new Set(mismatches.map((m) => m.side));

  if (data.quarterScores.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionHeading as="h3">Score par quart-temps</SectionHeading>
      <Table containerClassName="rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead />
            {data.quarterScores.map((_, i) => (
              <TableHead key={i} className="text-center">
                Q{i + 1}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(['home', 'away'] as const).map((side) => (
            <TableRow key={side}>
              <TableCell className="font-semibold">
                {side === 'home' ? homeLabel : awayLabel}
              </TableCell>
              {data.quarterScores.map((quarter, i) => (
                <TableCell key={i} className="p-1 text-center">
                  <FlaggedNumberCell
                    value={quarter[side]}
                    flagged={flaggedSides.has(side)}
                    editable={canManage}
                    onChange={(value) => onChange(i, side, value)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {mismatches.map((mismatch) => (
        <Text
          key={mismatch.side}
          variant="meta"
          size="xs"
          tone="accent"
          className="leading-relaxed"
        >
          Total lu {mismatch.side === 'home' ? `(${homeLabel})` : `(${awayLabel})`}&nbsp;:{' '}
          {mismatch.sum}. Corrigez les quarts-temps surlignés pour retrouver {mismatch.total}.
        </Text>
      ))}
    </div>
  );
}

function PlayerStatsTable({
  data,
  missingFields,
  canManage,
  onChange,
}: {
  data: ParsedScoresheetData;
  missingFields: MissingPlayerField[];
  canManage: boolean;
  onChange: (playerIndex: number, field: 'points' | 'fouls', value: number | null) => void;
}) {
  const isFlagged = (playerIndex: number, field: MissingPlayerField['field']) =>
    missingFields.some((m) => m.playerIndex === playerIndex && m.field === field);

  if (data.players.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionHeading as="h3">Statistiques joueurs</SectionHeading>
      <Table containerClassName="rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">#</TableHead>
            <TableHead>Joueur</TableHead>
            <TableHead className="text-center">Pts</TableHead>
            <TableHead className="text-center">F</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.players.map((player, i) => (
            <TableRow key={i}>
              <TableCell className="text-center tabular-nums text-muted">
                {player.number ?? '?'}
              </TableCell>
              <TableCell>{player.name ?? '?'}</TableCell>
              <TableCell className="p-1 text-center">
                <FlaggedNumberCell
                  value={player.points}
                  flagged={isFlagged(i, 'points')}
                  editable={canManage}
                  onChange={(value) => onChange(i, 'points', value)}
                />
              </TableCell>
              <TableCell className="p-1 text-center">
                <FlaggedNumberCell
                  value={player.fouls}
                  flagged={isFlagged(i, 'fouls')}
                  editable={canManage}
                  onChange={(value) => onChange(i, 'fouls', value)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The card shown once an uploaded scoresheet has come back from the OCR
 * pipeline as PARSED, NEEDS_REVIEW, or CONFIRMED (FAILED is a separate,
 * simpler card — see MatchScoresheetTab). Flagged cells (a quarter-sum
 * mismatch, a null player stat) are individually editable by a team manager;
 * the confirm button stays visible but disabled while any flag remains, so
 * the target action is never hidden mid-correction — matching the design
 * rationale recorded in ScoresheetResults.dc.html: a manager types the real
 * value directly into the cell where it already belongs, rather than
 * re-entering 20+ already-correct fields in a fresh form.
 */
export function ScoresheetExtractionCard({
  clubId,
  teamId,
  event,
  extraction,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  extraction: ScoresheetExtraction;
  canManage: boolean;
}) {
  const { mutate: confirm, isPending } = useConfirmEventScoresheetExtraction(
    clubId,
    teamId,
    event.id,
  );
  const [corrections, setCorrections] = useState<ParsedScoresheetData | null>(
    extraction.parsedData,
  );

  if (!corrections) {
    return null;
  }

  const mismatches = findQuarterMismatches(corrections);
  const missingFields = findMissingPlayerFields(corrections);
  const isReadOnly = extraction.status === 'CONFIRMED';
  const hasUnresolvedFlags = mismatches.length > 0 || missingFields.length > 0;

  const updateQuarter = (quarterIndex: number, side: 'home' | 'away', value: number | null) => {
    setCorrections((current) => {
      if (!current) return current;
      const quarterScores = current.quarterScores.map((q, i) =>
        i === quarterIndex ? { ...q, [side]: value } : q,
      );
      return { ...current, quarterScores };
    });
  };

  const updatePlayerStat = (
    playerIndex: number,
    field: 'points' | 'fouls',
    value: number | null,
  ) => {
    setCorrections((current) => {
      if (!current) return current;
      const players = current.players.map((p, i) =>
        i === playerIndex ? { ...p, [field]: value } : p,
      );
      return { ...current, players };
    });
  };

  const handleConfirm = () => {
    const edited = extraction.parsedData && !isSameParsedData(corrections, extraction.parsedData);
    confirm(edited ? corrections : undefined, {
      onSuccess: () => toast({ variant: 'success', title: 'Feuille de match confirmée' }),
      onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
    });
  };

  return (
    <Card variant="panel" className="flex max-w-sm flex-col gap-4 md:max-w-lg">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label" size="sm">
          {matchupLabel(event)}
        </Text>
        <StatusBadge extraction={extraction} />
      </div>

      {extraction.status === 'NEEDS_REVIEW' && hasUnresolvedFlags && canManage && (
        <Card variant="inset" className="flex flex-col gap-1 border-gold/35 bg-gold-tint">
          <Text variant="label" size="sm" tone="accent">
            {mismatches.length + missingFields.length} champ
            {mismatches.length + missingFields.length > 1 ? 's' : ''} à confirmer avant validation
          </Text>
          <Text variant="meta" size="xs" tone="accent">
            Corrigez les cases surlignées ci-dessous — la valeur exacte doit être ressaisie
            directement à sa place.
          </Text>
        </Card>
      )}

      <BoxScore data={corrections} event={event} />

      <QuarterScoreTable
        data={corrections}
        mismatches={mismatches}
        event={event}
        canManage={canManage && !isReadOnly}
        onChange={updateQuarter}
      />

      <PlayerStatsTable
        data={corrections}
        missingFields={missingFields}
        canManage={canManage && !isReadOnly}
        onChange={updatePlayerStat}
      />

      {isReadOnly ? (
        <Card variant="inset" className="flex items-center gap-2.5">
          <Text
            as="span"
            variant="body"
            tone="structure"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-green-tint"
          >
            <Check className="h-3.5 w-3.5" />
          </Text>
          <div className="flex flex-col gap-0.5">
            <Text variant="label" size="sm">
              Feuille de match confirmée
            </Text>
            {extraction.reviewedAt && (
              <Text variant="meta" size="xs">
                Validé le {formatEventDate(extraction.reviewedAt)}
              </Text>
            )}
          </div>
        </Card>
      ) : (
        canManage && (
          <div className="flex flex-col gap-2">
            <Button
              disabled={hasUnresolvedFlags}
              loading={isPending}
              onClick={handleConfirm}
              className="w-full"
            >
              <Check className="h-4 w-4" />
              Confirmer ces données
            </Button>
            {hasUnresolvedFlags && (
              <Text variant="meta" size="xs" className="text-center">
                Corrigez les champs surlignés pour activer la validation
              </Text>
            )}
          </div>
        )
      )}
    </Card>
  );
}
