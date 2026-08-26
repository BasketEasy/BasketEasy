import { FormField } from '@basketeasy/ui/form-field';
import { cn } from '@basketeasy/ui/cn';

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
 * this component only renders the field itself.
 */
export function FfbbLinkField({
  id,
  value,
  onChange,
  error,
  pending,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  pending?: boolean;
}) {
  return (
    <div>
      <FormField
        label="Lien FFBB de l'équipe (facultatif)"
        id={id}
        placeholder={FFBB_TEAM_URL_PLACEHOLDER}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        error={error}
      />
      {!error && (
        <p className={cn('mt-1.5 text-xs', pending ? 'text-blue-green' : 'text-muted')}>
          {pending ? FFBB_TEAM_URL_PENDING : FFBB_TEAM_URL_HELP}
        </p>
      )}
    </div>
  );
}
