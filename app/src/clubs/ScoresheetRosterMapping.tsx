import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SelectField } from '@basketeasy/ui/select-field';
import { Text } from '@basketeasy/ui/text';
import { Check } from '@basketeasy/ui/icons/check';
import { cn } from '@basketeasy/ui/cn';
import type {
  ParsedScoresheetData,
  ScoresheetTeamSide,
  SuggestedRosterMappingEntry,
} from '@basketeasy/types/scoresheet-extraction';
import type { TeamPlayer } from '@basketeasy/types/teams';

/** The select's "this number belongs to nobody in the squad" option. */
export const UNASSIGNED = 'unassigned';

/**
 * Points read for one jersey number on our own side of the sheet, so an
 * unassigned number can say what confirming will cost — "ses 6 points ne
 * seront comptés pour personne" is a far more useful warning than "numéro non
 * attribué".
 */
function pointsByJersey(
  data: ParsedScoresheetData,
  ourSide: ScoresheetTeamSide,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const play of data.scoringPlays) {
    if (play.team !== ourSide || play.jerseyNumber === null || play.points === null) {
      continue;
    }
    totals.set(play.jerseyNumber, (totals.get(play.jerseyNumber) ?? 0) + play.points);
  }
  return totals;
}

function playerName(player: TeamPlayer): string {
  return `${player.firstName} ${player.lastName}`;
}

/**
 * The step that turns a read of a piece of paper into season statistics:
 * which roster member wore each number on our own side of the sheet.
 *
 * It is written as a confirmation, not as data entry. The server has already
 * proposed a match for every legible name, so the common case is a manager
 * reading down a column of correct answers; only a number that resolved to
 * nobody is highlighted, borrowing the gold treatment the card already uses
 * for a flagged cell. An unassigned number never blocks the confirm — a
 * squad can field a licensed guest who simply isn't in the app — so the
 * consequence is stated instead of enforced.
 */
export function ScoresheetRosterMapping({
  suggestions,
  roster,
  data,
  ourSide,
  value,
  onChange,
  disabled,
}: {
  suggestions: SuggestedRosterMappingEntry[];
  roster: TeamPlayer[];
  data: ParsedScoresheetData;
  ourSide: ScoresheetTeamSide;
  /** jersey number → teamPlayerId, or UNASSIGNED. */
  value: Record<number, string>;
  onChange: (jerseyNumber: number, teamPlayerId: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  const points = pointsByJersey(data, ourSide);
  const assignedIds = new Set(Object.values(value).filter((id) => id !== UNASSIGNED));
  const recognized = suggestions.filter((entry) => entry.teamPlayerId !== null).length;
  const assignedCount = assignedIds.size;
  const unassignedCount = suggestions.length - assignedCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <SectionHeading>Qui est qui</SectionHeading>
        <Text variant="meta">
          Vérifiez à qui correspond chaque numéro de votre équipe. C&apos;est ce lien qui transforme
          la feuille en statistiques de saison.
        </Text>
      </div>

      <Card
        variant="inset"
        className="flex items-center gap-2.5 border-blue-green/25 bg-blue-green-tint"
      >
        <Check aria-hidden="true" tone="structure" className="h-4 w-4 shrink-0" />
        <Text variant="meta" tone="structure">
          <strong className="font-bold tabular">
            {recognized} numéro{recognized > 1 ? 's' : ''} sur {suggestions.length}
          </strong>{' '}
          reconnu{recognized > 1 ? 's' : ''} automatiquement. Corrigez ce qui ne va pas, puis
          confirmez.
        </Text>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border">
        {suggestions.map((entry, index) => {
          const selected = value[entry.jerseyNumber] ?? UNASSIGNED;
          const isUnassigned = selected === UNASSIGNED;
          const isSuggestion = entry.teamPlayerId !== null && selected === entry.teamPlayerId;
          const jerseyPoints = points.get(entry.jerseyNumber) ?? 0;

          return (
            <div
              key={entry.jerseyNumber}
              className={cn(
                'grid grid-cols-1 items-center gap-3 p-3 sm:grid-cols-[11rem_1fr]',
                index < suggestions.length - 1 && 'border-b border-border',
                isUnassigned && 'bg-gold-tint',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border font-heading text-lg font-extrabold tabular',
                    isUnassigned
                      ? 'border-gold/35 bg-surface text-gold-text'
                      : 'border-blue-green/25 bg-blue-green-tint text-blue-green',
                  )}
                >
                  {entry.jerseyNumber}
                </span>
                {entry.sheetName ? (
                  <Text as="span" variant="meta">
                    &laquo;&nbsp;{entry.sheetName}&nbsp;&raquo;
                  </Text>
                ) : (
                  <Text as="span" variant="meta" tone="accent" className="italic">
                    nom illisible
                  </Text>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <SelectField
                  label={`Joueur du numéro ${entry.jerseyNumber}`}
                  hideLabel
                  disabled={disabled}
                  value={selected}
                  onValueChange={(next) => onChange(entry.jerseyNumber, next)}
                  options={[
                    { value: UNASSIGNED, label: 'Non attribué' },
                    // TeamPlayer.id is the roster row's own id, which is what
                    // the mapping keys on — not playerId, which identifies the
                    // person across every team they're on.
                    ...roster.map((player) => ({
                      value: player.id,
                      label: playerName(player),
                      // The server rejects the same player on two numbers, so
                      // the UI shouldn't let it happen in the first place.
                      disabled: player.id !== selected && assignedIds.has(player.id),
                    })),
                  ]}
                />
                {isUnassigned ? (
                  <Text variant="meta" size="xs" tone="accent">
                    {jerseyPoints > 0
                      ? `Ses ${jerseyPoints} points ne seront comptés pour personne.`
                      : 'Ce numéro ne sera rattaché à personne.'}
                  </Text>
                ) : (
                  <Text
                    variant="meta"
                    size="xs"
                    tone={isSuggestion ? 'structure' : 'secondary'}
                    className="flex items-center gap-1.5"
                  >
                    {isSuggestion ? (
                      <>
                        <Check aria-hidden="true" className="h-3 w-3" />
                        Suggestion retenue
                      </>
                    ) : (
                      'Corrigé'
                    )}
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Text variant="meta" size="xs" className="text-center tabular">
        {assignedCount} numéro{assignedCount > 1 ? 's' : ''} rattaché
        {assignedCount > 1 ? 's' : ''} à l&apos;effectif
        {unassignedCount > 0 && (
          <>
            {' '}
            &middot; {unassignedCount} restera{unassignedCount > 1 ? 'ont' : ''} non attribué
            {unassignedCount > 1 ? 's' : ''}
          </>
        )}
      </Text>
    </div>
  );
}
