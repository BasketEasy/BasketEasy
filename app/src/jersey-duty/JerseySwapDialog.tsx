import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FieldError } from '@basketeasy/ui/field-error';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import type { JerseyDutyDetail } from '@basketeasy/types/jersey-duty';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { dutyPersonName, swapFootnote, swapIntro, turnsLabel } from './jerseyDutyCopy';
import { useJerseyDutySwap } from './useJerseyDutyMutations';

const swapSchema = z.object({
  teamPlayerId: z.string().min(1, 'Choisissez à qui proposer l’échange.'),
});

type SwapFormValues = z.infer<typeof swapSchema>;

/**
 * « Proposer un échange »: hand the wash to a teammate who is at the match.
 * The first candidate (the one with the fewest turns) is pre-selected; the
 * proposer stays responsible until the target accepts, which the footnote
 * says. A refusal from the server stays in the sheet, next to the button.
 */
export function JerseySwapDialog({
  clubId,
  teamId,
  eventId,
  detail,
  childName,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  detail: JerseyDutyDetail;
  /** Set when a guardian proposes for their child. */
  childName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutateAsync: proposeSwap } = useJerseyDutySwap(clubId, teamId, eventId);
  const candidates = detail.swapCandidates;
  const firstCandidateId = candidates[0]?.teamPlayerId ?? '';
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SwapFormValues>({
    resolver: zodResolver(swapSchema),
    defaultValues: { teamPlayerId: firstCandidateId },
  });

  useEffect(() => {
    if (open) reset({ teamPlayerId: firstCandidateId });
  }, [open, firstCandidateId, reset]);

  const onSubmit = async ({ teamPlayerId }: SwapFormValues) => {
    const target = candidates.find((candidate) => candidate.teamPlayerId === teamPlayerId);
    try {
      await proposeSwap({ teamPlayerId, targetName: target ? dutyPersonName(target) : '' });
      onOpenChange(false);
    } catch (err) {
      setError('root', {
        message: getClubErrorMessage(err, { 409: 'L’échange n’est plus disponible.' }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proposer un échange</DialogTitle>
          <DialogDescription>{swapIntro(detail.teamGender, childName)}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          {candidates.length === 0 ? (
            <Text variant="meta">Personne d’autre n’est disponible pour l’instant.</Text>
          ) : (
            <Controller
              control={control}
              name="teamPlayerId"
              render={({ field }) => (
                <RadioCardGroup
                  aria-label="À qui proposer l’échange"
                  tone="choice"
                  indicator
                  value={field.value || null}
                  onChange={field.onChange}
                  options={candidates.map((candidate) => ({
                    value: candidate.teamPlayerId,
                    render: () => (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <Text as="span" variant="label">
                          {dutyPersonName(candidate)}
                        </Text>
                        <Text as="span" variant="meta" className="tabular">
                          {turnsLabel(candidate.turnsThisSeason)}
                        </Text>
                      </span>
                    ),
                  }))}
                />
              )}
            />
          )}
          {errors.teamPlayerId?.message && <FieldError>{errors.teamPlayerId.message}</FieldError>}
          <Text variant="meta" size="xs">
            {swapFootnote(detail.teamGender, childName)}
          </Text>
          <div className="flex flex-col gap-2">
            <Button type="submit" loading={isSubmitting} disabled={candidates.length === 0}>
              Envoyer la proposition
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
