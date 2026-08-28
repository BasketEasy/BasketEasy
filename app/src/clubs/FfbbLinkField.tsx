import { type ReactNode } from 'react';
import { Label } from '@basketeasy/ui/label';
import { Input } from '@basketeasy/ui/input';
import { FieldError } from '@basketeasy/ui/field-error';
import { Text } from '@basketeasy/ui/text';

const FFBB_TEAM_URL_PLACEHOLDER =
  'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381';
const FFBB_TEAM_URL_HELP =
  "Collez l'URL complète de la page de l'équipe sur competitions.ffbb.com — un identifiant seul ne suffit pas.";
const FFBB_TEAM_URL_PENDING = 'Vérification du lien auprès de la FFBB…';

/**
 * Presentational label/input/helper for a pasted FFBB team URL — shared,
 * byte-for-byte identical copy, between TeamCreateForm's RHF-controlled
 * field and TeamFfbbLinkList's isolated add-row, per the design spec's
 * "same FfbbLinkAddRow reused in both places, not a reimplementation."
 * Each embedding context owns its own submit button and mutation state;
 * this component only renders the field itself, plus an optional inline
 * `action` (TeamFfbbLinkList's "Ajouter" button) rendered in the same row
 * as the input — so an adjacent button lines up with the input box itself,
 * not with the label sitting above it.
 */
export function FfbbLinkField({
  id,
  value,
  onChange,
  error,
  pending,
  action,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  pending?: boolean;
  action?: ReactNode;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>Lien FFBB de l'équipe (facultatif)</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          id={id}
          placeholder={FFBB_TEAM_URL_PLACEHOLDER}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={pending}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helpId}
          className="flex-1"
        />
        {action}
      </div>
      {error ? (
        <FieldError id={errorId} className="mt-1.5">
          {error}
        </FieldError>
      ) : (
        <Text
          id={helpId}
          variant="meta"
          size="xs"
          tone={pending ? 'structure' : 'secondary'}
          className="mt-1.5"
        >
          {pending ? FFBB_TEAM_URL_PENDING : FFBB_TEAM_URL_HELP}
        </Text>
      )}
    </div>
  );
}
