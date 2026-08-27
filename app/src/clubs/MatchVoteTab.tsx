import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { Check } from '@basketeasy/ui/icons/check';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { toast } from '@basketeasy/ui/toast-store';
import type {
  EventVoteCandidateResult,
  EventVoteCategory,
  EventVoteResults,
  TeamEvent,
} from '@basketeasy/types/events';
import { getClubErrorMessage } from './clubErrorMessages';
import { getInitials } from './getInitials';
import { formatVoteWindowEnd, hasVoteWindowClosed, voteWindowOpensAt } from './voteWindow';
import { useEventConvocations } from './useEventConvocations';
import { useEventVoteCast } from './useEventVoteCast';
import { useEventVoteResults } from './useEventVoteResults';
import { computeRanks, countTiedAtTop } from './voteTies';
import { WorstIcon } from './voteIcons';

// Per-rank bar opacity in the results leaderboards — transcribed from
// Vote.dc.html's 1st/2nd/3rd place convention (1 / 0.75 / 0.6), extended to
// a reasonable floor beyond that rather than inventing a fourth mockup value.
const RANK_OPACITIES = [1, 0.75, 0.6];
function rankOpacity(index: number): number {
  return RANK_OPACITIES[index] ?? 0.5;
}

interface VoteCandidate {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
}

function BallotRow({
  candidate,
  selected,
  category,
  onSelect,
}: {
  candidate: VoteCandidate;
  selected: boolean;
  category: EventVoteCategory;
  onSelect: (teamPlayerId: string) => void;
}) {
  const initials = getInitials(candidate.firstName, candidate.lastName);
  const name = `${candidate.firstName} ${candidate.lastName}`;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(candidate.teamPlayerId)}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors',
        selected
          ? category === 'BEST'
            ? 'bg-orange shadow-segment-active'
            : 'border-2 border-blue-green-2 bg-sunk'
          : 'border border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          selected && category === 'BEST'
            ? 'bg-surface-2 text-orange-text'
            : 'bg-blue-green text-cream',
        )}
      >
        {initials}
      </span>
      <span
        className={cn(
          'text-sm',
          selected ? 'font-bold' : 'font-semibold',
          selected && category === 'BEST' ? 'text-cream' : 'text-charcoal',
        )}
      >
        {name}
      </span>
      {selected && (
        <Check
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0',
            category === 'BEST' ? 'text-cream' : 'text-blue-green-2',
          )}
        />
      )}
    </button>
  );
}

function BallotSection({
  title,
  helperText,
  candidates,
  selected,
  category,
  onSelect,
}: {
  title: string;
  helperText?: string;
  candidates: VoteCandidate[];
  selected: string | null;
  category: EventVoteCategory;
  onSelect: (teamPlayerId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={title}>
      <span className="text-xs font-bold uppercase tracking-eyebrow text-charcoal">{title}</span>
      {helperText && <span className="text-xs leading-relaxed text-muted">{helperText}</span>}
      <div className="flex flex-col gap-1.5">
        {candidates.map((candidate) => (
          <BallotRow
            key={candidate.teamPlayerId}
            candidate={candidate}
            selected={selected === candidate.teamPlayerId}
            category={category}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function BestResultRow({
  result,
  rank,
  widthPct,
}: {
  result: EventVoteCandidateResult;
  rank: number;
  widthPct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
          rank === 1 ? 'bg-gold text-gold-tint' : 'bg-sunk text-muted',
        )}
      >
        {rank}
      </span>
      <Avatar className="h-7 w-7 text-xs">
        <AvatarFallback>{getInitials(result.firstName, result.lastName)}</AvatarFallback>
      </Avatar>
      <span
        className={cn(
          'w-24 shrink-0 truncate text-sm text-charcoal',
          rank === 1 ? 'font-bold' : 'font-semibold',
        )}
      >
        {result.firstName} {result.lastName}
      </span>
      <div className="h-2 flex-grow overflow-hidden rounded-full bg-gold-tint">
        <div
          className="h-full bg-gold"
          style={{ width: `${widthPct}%`, opacity: rankOpacity(rank - 1) }}
        />
      </div>
      <span className="tabular w-6 shrink-0 text-right text-xs font-bold text-gold-text">
        {result.voteCount}
      </span>
    </div>
  );
}

function WorstResultRow({
  result,
  rank,
  widthPct,
}: {
  result: EventVoteCandidateResult;
  rank: number;
  widthPct: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-24 shrink-0 truncate text-sm font-semibold text-charcoal">
        {result.firstName} {result.lastName}
      </span>
      <div className="h-2 flex-grow overflow-hidden rounded-full bg-sunk">
        <div
          className="h-full rounded-full bg-blue-green-2"
          style={{ width: `${widthPct}%`, opacity: rankOpacity(rank - 1) }}
        />
      </div>
      <span className="tabular w-5 shrink-0 text-right text-xs font-bold text-muted">
        {result.voteCount}
      </span>
    </div>
  );
}

/**
 * Both categories' results card — extracted so it can render two ways: gated
 * behind a "vote to see results" message while voting is still live (the
 * common case, shown only to eligible voters — see EventDetailPage's
 * showVoteTab), or fully open once the vote window has closed, when results
 * go public to everyone (`gateMessage: null`).
 */
function MatchVoteResultsCard({
  results,
  gateMessage,
}: {
  results: EventVoteResults;
  gateMessage: string | null;
}) {
  // Bar width denominator for both leaderboards: the distinct voter count,
  // not the leading candidate's own tally — a share-of-votes-cast bar, not a
  // relative-to-leader one (Vote.dc.html's 5/3/2-vote sample against "6
  // votes exprimés" works out to 83%/50%/33%, confirming the denominator).
  const voteDenominator = results.votesCast > 0 ? results.votesCast : 1;
  // Competition ranking (two tied for 1st both get "1", the next entry is
  // "3", not "2") rather than plain array position — a positional rank
  // would otherwise imply one tied candidate beat the other.
  const bestRanks = computeRanks(results.best);
  const worstRanks = computeRanks(results.worst);
  const bestTiedAtTop = countTiedAtTop(results.best);

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-md">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-muted">
          Résultats — visibles par toute l&apos;équipe
        </span>
        <div className="flex items-center gap-2">
          <TrophyIcon className="h-5 w-5 text-gold" />
          <h3 className="font-heading text-lg font-extrabold">Meilleur joueur</h3>
        </div>
      </div>

      {gateMessage ? (
        <span className="text-sm text-muted">{gateMessage}</span>
      ) : results.best.length === 0 ? (
        <span className="text-sm text-muted">Aucun vote pour l&apos;instant.</span>
      ) : (
        <div className="flex flex-col gap-2.5">
          {results.best.map((result, index) => (
            <BestResultRow
              key={result.teamPlayerId}
              result={result}
              rank={bestRanks[index]}
              widthPct={Math.round((result.voteCount / voteDenominator) * 100)}
            />
          ))}
        </div>
      )}
      <span className="text-xs text-muted">
        {results.votesCast} vote{results.votesCast > 1 ? 's' : ''} exprimé
        {results.votesCast > 1 ? 's' : ''} sur {results.totalVoters}
        {/* A tie at rank 1 makes the numbered gold badge alone ambiguous
            ("is #1 the MVP, or is this a tie?") in a way lower ranks
            aren't — the bar length already shows equality there, but a
            single "MVP" framing benefits from saying it outright. */}
        {!gateMessage && bestTiedAtTop > 1 && (
          <span className="text-gold-text"> · Égalité en tête</span>
        )}
      </span>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <WorstIcon size={16} className="text-blue-green-2" />
          <h3 className="text-base font-extrabold">Joueur en difficulté — agrégé</h3>
        </div>
        {gateMessage ? (
          <span className="text-sm text-muted">{gateMessage}</span>
        ) : results.worst.length === 0 ? (
          <span className="text-sm text-muted">Aucun vote pour l&apos;instant.</span>
        ) : (
          <div className="flex flex-col gap-2">
            {results.worst.map((result, index) => (
              <WorstResultRow
                key={result.teamPlayerId}
                result={result}
                rank={worstRanks[index]}
                widthPct={Math.round((result.voteCount / voteDenominator) * 100)}
              />
            ))}
          </div>
        )}
        <span className="text-xs text-muted">
          {results.votesCast} vote{results.votesCast > 1 ? 's' : ''} exprimé
          {results.votesCast > 1 ? 's' : ''} · réponse optionnelle
        </span>
      </div>
    </Card>
  );
}

/**
 * Match detail page's Vote tab (`Vote.dc.html`) — a ballot (own vote, one
 * selection per category, WORST optional) alongside the results card, per
 * the match interface spec's Voting visibility section. No new roster
 * endpoint: reuses useEventConvocations for the candidate list
 * (teamPlayerId/firstName/lastName/isMe), same as EventLogisticsSection.
 *
 * Three states, keyed off the vote window (opens 1h after kickoff, closes
 * 5 days after — see voteWindow.ts):
 * - **Not yet open**: this component only mounts here if the viewer can
 *   vote (EventDetailPage's showVoteTab already filtered for
 *   convoked+present, or the window has closed) — so reaching this state
 *   means the viewer is eligible and just has to wait.
 * - **Open**: ballot + results gated behind "vote to see results" — also
 *   only reachable by an eligible voter, same reasoning.
 * - **Closed**: results only, ungated, no ballot — the Vote tab is visible
 *   to the whole team at this point (EventDetailPage), not just voters.
 */
export function MatchVoteTab({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  const [selectedBest, setSelectedBest] = useState<string | null>(null);
  const [selectedWorst, setSelectedWorst] = useState<string | null>(null);
  // Seeds the ballot from the caller's own previous vote once per mount, not
  // on every background refetch — otherwise an in-progress, unsubmitted
  // selection would silently get overwritten, same fix already applied to
  // EventConvocationModal's seeding.
  const hasSeededRef = useRef(false);
  const hasOpened = new Date() >= voteWindowOpensAt(event.startsAt);
  const hasClosed = hasVoteWindowClosed(event.startsAt);
  const isVotingLive = hasOpened && !hasClosed;

  // Candidates are only needed while the ballot itself is actionable;
  // results are needed both while voting (gated) and once closed (public).
  const {
    data: roster,
    isLoading: isLoadingRoster,
    isError: isRosterError,
    refetch: refetchRoster,
  } = useEventConvocations(clubId, teamId, event.id, isVotingLive);
  const {
    data: results,
    isLoading: isLoadingResults,
    isError: isResultsError,
    refetch: refetchResults,
  } = useEventVoteResults(clubId, teamId, event.id, hasOpened);
  const { mutateAsync: castVote, isPending } = useEventVoteCast(clubId, teamId);

  useEffect(() => {
    if (results && !hasSeededRef.current) {
      setSelectedBest(results.myVote.best);
      setSelectedWorst(results.myVote.worst);
      hasSeededRef.current = true;
    }
  }, [results]);

  if (!hasOpened) {
    return (
      <EmptyState
        icon={<TrophyIcon className="h-8 w-8 text-muted" />}
        title="Le vote ouvrira après le match"
        description="Le bulletin de vote ouvre 1h après le début de la rencontre."
      />
    );
  }

  if (hasClosed) {
    if (isResultsError) {
      return <QueryError onRetry={() => refetchResults()} />;
    }
    if (isLoadingResults || !results) {
      return <SkeletonList rows={4} variant="card" />;
    }
    return (
      <div className="max-w-xl">
        <MatchVoteResultsCard results={results} gateMessage={null} />
      </div>
    );
  }

  if (isRosterError || isResultsError) {
    return (
      <QueryError
        onRetry={() => {
          if (isRosterError) refetchRoster();
          if (isResultsError) refetchResults();
        }}
      />
    );
  }

  if (isLoadingRoster || isLoadingResults || !roster || !results) {
    return <SkeletonList rows={4} variant="card" />;
  }

  const candidates: VoteCandidate[] = roster.filter((r) => !r.isMe);

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon className="h-8 w-8 text-muted" />}
        title="Pas assez de joueurs à départager"
        description="Il faut au moins un·e autre coéquipier·ère sur l'effectif pour voter."
      />
    );
  }

  const handleSubmit = async () => {
    if (!selectedBest) {
      return;
    }
    try {
      await castVote({ eventId: event.id, category: 'BEST', teamPlayerId: selectedBest });
      if (selectedWorst) {
        await castVote({ eventId: event.id, category: 'WORST', teamPlayerId: selectedWorst });
      }
    } catch (err) {
      toast({ variant: 'destructive', description: getClubErrorMessage(err) });
    }
  };

  const hasVoted = results.myVote.best !== null;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4 p-5 shadow-md">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-orange-text" />
            <h3 className="font-heading text-xl font-extrabold">Bulletin de vote</h3>
          </div>
          <span className="text-xs text-muted">
            Ouvert jusqu&apos;au {formatVoteWindowEnd(event.startsAt)} · un vote par catégorie
          </span>
        </div>

        <BallotSection
          title="Meilleur joueur du match"
          candidates={candidates}
          selected={selectedBest}
          category="BEST"
          onSelect={setSelectedBest}
        />

        <div className="h-px bg-border" />

        <BallotSection
          title="Joueur en difficulté ce match"
          helperText="Optionnel. Vote anonyme — le classement agrégé est visible par toute l'équipe."
          candidates={candidates}
          selected={selectedWorst}
          category="WORST"
          onSelect={(id) => setSelectedWorst((current) => (current === id ? null : id))}
        />

        <Button disabled={!selectedBest} loading={isPending} onClick={handleSubmit}>
          Envoyer mon vote
        </Button>
        {hasVoted && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <Check className="h-3 w-3 shrink-0" />
            Vote envoyé — merci !
          </span>
        )}
      </Card>

      <MatchVoteResultsCard
        results={results}
        gateMessage={hasVoted ? null : 'Votez pour voir les résultats.'}
      />
    </div>
  );
}
