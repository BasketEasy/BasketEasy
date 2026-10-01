import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Divider } from '@basketeasy/ui/divider';
import { IconBadge } from '@basketeasy/ui/icon-badge';
import { Check } from '@basketeasy/ui/icons/check';
import { BagIcon } from '@basketeasy/ui/icons/bag';
import { SwapIcon } from '@basketeasy/ui/icons/swap';
import { QueryError } from '@basketeasy/ui/query-error';
import { Skeleton } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import type { TeamEvent } from '@basketeasy/types/events';
import type { JerseyDutyDetail } from '@basketeasy/types/jersey-duty';
import { formatEventDayMonth } from '../clubs/eventDateFormat';
import { JerseyIcon } from '../clubs/eventLogisticsIcons';
import { getInitials } from '../clubs/getInitials';
import { useEventConvocations } from '../clubs/useEventConvocations';
import { useEventRsvps } from '../clubs/useEventRsvps';
import { useActingAs, useTeamActingAs } from '../guardians/useActingAs';
import { buildAssignOptions } from './assignOptions';
import { JerseyAssignField } from './JerseyAssignField';
import { DutyNotice, DutyPersonRow } from './JerseyDutyParts';
import { JerseySwapDialog } from './JerseySwapDialog';
import {
  acceptLabel,
  acceptedLine,
  declineLabel,
  dutyPersonName,
  emptyPoolBody,
  holderStatus,
  ownRowName,
  poolSummary,
  suggestionMeta,
  turnTitle,
  turnsLabel,
  withdrawLabel,
} from './jerseyDutyCopy';
import { useJerseyDuty, useJerseyRotation } from './useJerseyDuty';
import {
  useJerseyDutyAccept,
  useJerseyDutyAcceptSwap,
  useJerseyDutyCancelSwap,
  useJerseyDutyDecline,
  useJerseyDutyRefuseSwap,
  useJerseyDutySetDone,
  useJerseyDutySetVoided,
} from './useJerseyDutyMutations';

interface BlockProps {
  clubId: string;
  teamId: string;
  eventId: string;
  detail: JerseyDutyDetail;
  /** The first name of the child a guardian acts for; null when the reader acts for themself. */
  childName: string | null;
}

/**
 * « Lavage des maillots »: who takes the team's jersey set home after this
 * match, as the reader may act on it. A fixed header (title, who brought the
 * set), then one state block in an inset card; every state is drawn on the
 * validated canvas (`docs/decisions/events.md`, « Jersey wash rotation »).
 *
 * The state is chosen from the server's `rights`, never recomputed here:
 * « can this reader accept » is the server's rule, and a second copy would
 * drift. A manager never sees the player's buttons (the manager block has its
 * own), and a swap received outranks everything, since it is the one thing
 * that waits for this reader.
 */
export function EventJerseyDutyCard({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  const query = useJerseyDuty(clubId, teamId, event.id);
  const forPlayerId = useTeamActingAs(teamId);
  const { persona } = useActingAs();
  const childName = forPlayerId && persona ? persona.firstName : null;
  const detail = query.data;
  const isLocked = detail?.locked ?? false;
  const canManage = detail?.rights.canManage ?? false;

  return (
    <Card>
      <div className="flex flex-col gap-3.5 p-4">
        <div className="flex items-center gap-3">
          <IconBadge>
            <JerseyIcon size="lg" />
          </IconBadge>
          <div className="flex flex-col">
            <Text variant="label">Lavage des maillots</Text>
            <Text variant="meta">
              {isLocked && canManage ? 'Verrouillé depuis le coup d’envoi' : 'Après le match'}
            </Text>
          </div>
        </div>
        {query.isError ? (
          <QueryError
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
            title="Lavage indisponible"
          />
        ) : query.isLoading || !detail ? (
          <div className="flex flex-col gap-3.5" role="status" aria-label="Chargement…">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <>
            {detail.broughtBy && (
              <div className="flex items-center gap-2">
                <BagIcon size="md" tone="secondary" />
                <Text as="span" variant="meta" size="sm">
                  Maillots apportés par{' '}
                  <Text as="span" variant="label" size="sm">
                    {dutyPersonName(detail.broughtBy)}
                  </Text>
                </Text>
              </div>
            )}
            <Divider />
            <DutyState
              clubId={clubId}
              teamId={teamId}
              eventId={event.id}
              detail={detail}
              childName={childName}
              isMine={event.jerseyDuty?.isMine ?? false}
            />
          </>
        )}
      </div>
    </Card>
  );
}

function DutyState({ isMine, ...block }: BlockProps & { isMine: boolean }) {
  const { detail } = block;
  const { rights, holder, suggestion, locked } = detail;

  if (rights.canRespondToSwap && holder) return <SwapReceivedBlock {...block} />;
  if (rights.canManage) return <ManagerBlock {...block} />;

  // « The persona holds it »: the server exposes it through the rights while
  // the match hasn't started, and through the event's summary after.
  const holderIsMine = holder !== null && (rights.canDecline || rights.canCancelSwap || isMine);
  if (holder && holderIsMine) {
    if (rights.canCancelSwap) return <PendingSwapBlock {...block} />;
    if (rights.canAccept) return <MyTurnBlock {...block} />;
    return <HolderBlock {...block} isMine />;
  }
  if (holder) return <HolderBlock {...block} isMine={false} />;

  if (suggestion?.kind === 'SUGGESTED') {
    return rights.canDecline ? <MyTurnBlock {...block} /> : <SuggestedByOthersBlock {...block} />;
  }
  if (suggestion?.kind === 'EMPTY_POOL') return <EmptyPoolBlock detail={detail} />;
  if (suggestion?.kind === 'AFTER_PREVIOUS') return <AfterPreviousBlock detail={detail} />;
  return (
    <Card variant="inset">
      <DutyNotice title={locked ? 'Personne n’a lavé les maillots' : 'Pas de suggestion'}>
        {locked
          ? 'Un·e responsable peut encore assigner quelqu’un.'
          : 'Aucun lavage assigné pour ce match.'}
      </DutyNotice>
    </Card>
  );
}

/** The suggested player (or the holder who hasn't confirmed): « C'est votre tour ». */
function MyTurnBlock({ clubId, teamId, eventId, detail, childName }: BlockProps) {
  const [isSwapOpen, setSwapOpen] = useState(false);
  const accept = useJerseyDutyAccept(clubId, teamId, eventId);
  const decline = useJerseyDutyDecline(clubId, teamId, eventId);
  const { holder, suggestion, teamGender, rights } = detail;
  const person = holder ?? (suggestion?.kind === 'SUGGESTED' ? suggestion.candidate : null);
  if (!person) return null;
  const isSuggestion = holder === null;
  const isFewest = suggestion?.kind === 'SUGGESTED' && suggestion.isFewest;
  const meta = isSuggestion
    ? suggestionMeta(person.turnsThisSeason, isFewest)
    : `${turnsLabel(person.turnsThisSeason)} cette saison.`;

  return (
    <>
      <Card variant="inset" tone="brand" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <Text variant="eyebrow" tone="brand">
            {isSuggestion ? 'Suggestion' : 'Assignation'}
          </Text>
          <Text as="p" variant="display" size="2xl" className="uppercase">
            {turnTitle(childName)}
          </Text>
          <Text variant="meta">{meta}</Text>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            loading={accept.isPending}
            disabled={!rights.canAccept || decline.isPending}
            onClick={() => accept.mutate()}
          >
            <Check size="md" />
            {acceptLabel(childName)}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              loading={decline.isPending}
              disabled={accept.isPending}
              onClick={() => decline.mutate()}
            >
              {declineLabel(childName, person.gender, teamGender)}
            </Button>
            <Button variant="outline" disabled={!rights.canSwap} onClick={() => setSwapOpen(true)}>
              <SwapIcon size="md" />
              Échanger
            </Button>
          </div>
        </div>
      </Card>
      {isSuggestion && (
        <Text variant="meta" size="xs">
          La suggestion change si les présences changent, jusqu’à ce que quelqu’un accepte.
        </Text>
      )}
      <JerseySwapDialog
        clubId={clubId}
        teamId={teamId}
        eventId={eventId}
        detail={detail}
        childName={childName}
        open={isSwapOpen}
        onOpenChange={setSwapOpen}
      />
    </>
  );
}

/** The holder, as the persona sees their own row or anyone else's. */
function HolderBlock({
  clubId,
  teamId,
  eventId,
  detail,
  childName,
  isMine,
}: BlockProps & { isMine: boolean }) {
  const [isSwapOpen, setSwapOpen] = useState(false);
  const decline = useJerseyDutyDecline(clubId, teamId, eventId);
  const { holder, status, locked, rights, teamGender, acceptedBy, nextMatchStartsAt } = detail;
  if (!holder) return null;
  const nextDay = nextMatchStartsAt ? formatEventDayMonth(nextMatchStartsAt) : null;
  const state = holderStatus(status, locked, nextDay);
  const isAcceptedByPersona = isMine && !locked && status === 'ACCEPTED';

  return (
    <>
      <DutyPersonRow
        firstName={holder.firstName}
        lastName={holder.lastName}
        name={isMine ? ownRowName(childName) : dutyPersonName(holder)}
        isMe={isMine}
        description={isAcceptedByPersona ? acceptedLine(acceptedBy, childName) : state.description}
        badge={{ label: state.badge, tone: state.tone }}
      />
      {isAcceptedByPersona && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={decline.isPending}
            onClick={() => decline.mutate()}
          >
            {withdrawLabel(childName, holder.gender, teamGender)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!rights.canSwap}
            onClick={() => setSwapOpen(true)}
          >
            <SwapIcon size="md" />
            Échanger
          </Button>
        </div>
      )}
      <JerseySwapDialog
        clubId={clubId}
        teamId={teamId}
        eventId={eventId}
        detail={detail}
        childName={childName}
        open={isSwapOpen}
        onOpenChange={setSwapOpen}
      />
    </>
  );
}

function PendingSwapBlock({ clubId, teamId, eventId, detail, childName }: BlockProps) {
  const cancel = useJerseyDutyCancelSwap(clubId, teamId, eventId);
  const { holder, pendingSwap } = detail;
  if (!holder || !pendingSwap) return null;
  return (
    <>
      <DutyPersonRow
        firstName={holder.firstName}
        lastName={holder.lastName}
        name={ownRowName(childName)}
        isMe
        description={`Échange proposé à ${dutyPersonName(pendingSwap.to)}`}
        badge={{ label: 'En attente', tone: 'brand' }}
      />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        loading={cancel.isPending}
        onClick={() => cancel.mutate()}
      >
        Annuler la proposition
      </Button>
    </>
  );
}

function SwapReceivedBlock({ clubId, teamId, eventId, detail, childName }: BlockProps) {
  const accept = useJerseyDutyAcceptSwap(clubId, teamId, eventId);
  const refuse = useJerseyDutyRefuseSwap(clubId, teamId, eventId);
  const { holder } = detail;
  if (!holder) return null;
  const proposer = dutyPersonName(holder);
  return (
    <Card variant="inset" tone="structure" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar size="md">
          <AvatarFallback>{getInitials(holder.firstName, holder.lastName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text variant="eyebrow" tone="structure">
            Échange proposé
          </Text>
          <Text as="p" variant="label" size="lg">
            {childName
              ? `${proposer} propose à ${childName} de laver les maillots à sa place.`
              : `${proposer} vous propose de laver les maillots à sa place.`}
          </Text>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          loading={accept.isPending}
          disabled={refuse.isPending}
          onClick={() => accept.mutate()}
        >
          Accepter
        </Button>
        <Button
          variant="outline"
          loading={refuse.isPending}
          disabled={accept.isPending}
          onClick={() => refuse.mutate()}
        >
          Refuser
        </Button>
      </div>
    </Card>
  );
}

/** Someone else is suggested: read-only, and not yet theirs. */
function SuggestedByOthersBlock({ detail }: BlockProps) {
  const { suggestion } = detail;
  if (suggestion?.kind !== 'SUGGESTED') return null;
  const person = suggestion.candidate;
  return (
    <DutyPersonRow
      firstName={person.firstName}
      lastName={person.lastName}
      name={dutyPersonName(person)}
      description="Suggestion, pas encore confirmée"
      badge={{ label: 'Suggérée', tone: 'muted' }}
    />
  );
}

function EmptyPoolBlock({ detail }: { detail: JerseyDutyDetail }) {
  return (
    <Card variant="inset">
      <DutyNotice title="Aucune suggestion pour l’instant">
        {emptyPoolBody(detail.teamGender)}
      </DutyNotice>
    </Card>
  );
}

function AfterPreviousBlock({ detail }: { detail: JerseyDutyDetail }) {
  if (detail.suggestion?.kind !== 'AFTER_PREVIOUS') return null;
  return (
    <Card variant="inset">
      <DutyNotice
        title={`Suggestion après le match du ${formatEventDayMonth(detail.suggestion.previousMatchStartsAt)}`}
      >
        On attend de savoir qui lave après ce match-là.
      </DutyNotice>
    </Card>
  );
}

/**
 * A team manager's view. Before kickoff: the holder or the suggestion, and
 * one inline field to assign someone else. After: the holder, and the three
 * reversible status controls (done, change, void), inline since each is one
 * click to undo.
 */
function ManagerBlock({ clubId, teamId, eventId, detail }: BlockProps) {
  const [isChanging, setChanging] = useState(false);
  const setDone = useJerseyDutySetDone(clubId, teamId, eventId);
  const setVoided = useJerseyDutySetVoided(clubId, teamId, eventId);
  const { data: roster } = useEventConvocations(clubId, teamId, eventId, true);
  const { data: rsvps } = useEventRsvps(clubId, teamId, eventId, true);
  const { data: overview } = useJerseyRotation(clubId, teamId);
  const { holder, suggestion, status, locked, nextMatchStartsAt, teamGender, pool } = detail;
  const options = buildAssignOptions({
    roster: roster ?? [],
    rsvps,
    overview,
    teamGender,
    hasHolder: holder !== null,
  });
  const nextDay = nextMatchStartsAt ? formatEventDayMonth(nextMatchStartsAt) : null;

  const person = holder ?? (suggestion?.kind === 'SUGGESTED' ? suggestion.candidate : null);
  const state = holderStatus(status, locked, nextDay);
  const row = person && (
    <DutyPersonRow
      firstName={person.firstName}
      lastName={person.lastName}
      name={dutyPersonName(person)}
      description={
        holder
          ? state.description
          : `Suggestion · ${turnsLabel(person.turnsThisSeason)} cette saison`
      }
      note={person.reachable ? undefined : 'Personne ne sera prévenu'}
      badge={
        holder ? { label: state.badge, tone: state.tone } : { label: 'Suggérée', tone: 'muted' }
      }
    />
  );

  if (locked) {
    const showSelect = isChanging || !holder;
    return (
      <>
        {row ?? (
          <Card variant="inset">
            <DutyNotice title="Personne n’a lavé les maillots">
              Assignez quelqu’un pour que le tour compte.
            </DutyNotice>
          </Card>
        )}
        {holder && (
          <div className="grid grid-cols-2 gap-2">
            {status === 'VOIDED' ? (
              <Button
                variant="outline"
                size="sm"
                loading={setVoided.isPending}
                onClick={() => setVoided.mutate(false)}
              >
                Rétablir ce tour
              </Button>
            ) : (
              <>
                {status === 'DONE' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={setDone.isPending}
                    onClick={() => setDone.mutate(false)}
                  >
                    Rouvrir
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={setDone.isPending}
                    onClick={() => setDone.mutate(true)}
                  >
                    <Check size="md" />
                    Marquer fait
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
                  Changer
                </Button>
              </>
            )}
          </div>
        )}
        {showSelect && (
          <JerseyAssignField
            clubId={clubId}
            teamId={teamId}
            eventId={eventId}
            label={holder ? 'Assigner quelqu’un d’autre' : 'Assigner quelqu’un'}
            options={options}
          />
        )}
        {holder && status !== 'VOIDED' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              loading={setVoided.isPending}
              onClick={() => setVoided.mutate(true)}
            >
              Annuler ce tour
            </Button>
            <Text variant="meta" size="xs">
              « Annuler ce tour » : le lavage ne compte pas (sac resté au gymnase…).
            </Text>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {row ??
        (suggestion?.kind === 'EMPTY_POOL' ? (
          <EmptyPoolBlock detail={detail} />
        ) : suggestion?.kind === 'AFTER_PREVIOUS' ? (
          <AfterPreviousBlock detail={detail} />
        ) : null)}
      <JerseyAssignField
        clubId={clubId}
        teamId={teamId}
        eventId={eventId}
        label="Assigner quelqu’un d’autre"
        options={options}
      />
      {suggestion?.kind !== 'AFTER_PREVIOUS' && (
        <Text variant="meta" size="xs">
          {poolSummary(pool, teamGender)}
        </Text>
      )}
    </>
  );
}
