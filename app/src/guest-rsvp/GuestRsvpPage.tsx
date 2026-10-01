import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHero } from '@basketeasy/ui/page-hero';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { ApiError } from '../api/client';
import { getInitials } from '../clubs/getInitials';
import { GuestEventCard } from './GuestEventCard';
import { GuestInviteNudge } from './GuestInviteNudge';
import { GuestRosterPicker } from './GuestRosterPicker';
import { guestMemberName } from './guestMemberName';
import { useGuestIdentity } from './useGuestIdentity';
import { useGuestPage } from './useGuestPage';
import { useNoIndex } from './useNoIndex';

/**
 * `?src=wa` marks a visit that came through the shared WhatsApp message. Read
 * once on mount into component state (attribution is per visit, so not
 * localStorage) and stripped from the URL, so a copied address doesn't carry it.
 */
function useWhatsAppAttribution(): 'WHATSAPP' | undefined {
  const [searchParams, setSearchParams] = useSearchParams();
  const [via] = useState<'WHATSAPP' | undefined>(() =>
    searchParams.get('src') === 'wa' ? 'WHATSAPP' : undefined,
  );
  useEffect(() => {
    if (!searchParams.has('src')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('src');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  return via;
}

/**
 * `/r/:token` — a team's shared « réponse sans compte » link. Top level,
 * outside both route guards: a logged-in visitor sees this page too.
 */
export function GuestRsvpPage() {
  const { token = '' } = useParams<{ token: string }>();
  useNoIndex();
  const { data, isLoading, isError, error, refetch } = useGuestPage(token);
  const {
    teamPlayerId: storedId,
    choose: chooseIdentity,
    reset: resetIdentity,
  } = useGuestIdentity(token);
  const [hasAnswered, setHasAnswered] = useState(false);
  // A new identity has not answered yet: the invite nudge (and its
  // invite-request) must not fire for someone who only picked their name.
  const choose = (teamPlayerId: string) => {
    setHasAnswered(false);
    chooseIdentity(teamPlayerId);
  };
  const reset = () => {
    setHasAnswered(false);
    resetIdentity();
  };
  const via = useWhatsAppAttribution();

  // A remembered player who has since left the roster is treated as unset.
  const me = data?.roster.find((member) => member.teamPlayerId === storedId) ?? null;

  return (
    <PageContainer size="md">
      <div className="flex flex-col gap-5">
        <Text as="span" variant="display" size="2xl" tone="brand" className="uppercase">
          Kluvo
        </Text>
        {isError ? (
          error instanceof ApiError && error.status === 404 ? (
            <EmptyState
              title="Ce lien n'est plus actif"
              description="Demandez le nouveau lien à votre coach."
            />
          ) : (
            <QueryError onRetry={() => refetch()} />
          )
        ) : isLoading || !data ? (
          <SkeletonList rows={3} variant="card" />
        ) : (
          <>
            <PageHero
              eyebrow={data.clubName}
              title={data.teamName}
              meta="Répondez pour les 14 prochains jours"
            />
            {!me ? (
              data.roster.length === 0 ? (
                <EmptyState title="Aucun joueur dans cette équipe" />
              ) : (
                <GuestRosterPicker roster={data.roster} onChoose={choose} />
              )
            ) : (
              <>
                <Card variant="inset" className="flex items-center gap-3">
                  <Avatar size="md">
                    <AvatarFallback>
                      {getInitials(me.firstName, me.lastInitial ?? '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Text variant="meta" size="sm">
                      Vous répondez pour
                    </Text>
                    <Text variant="label">{guestMemberName(me)}</Text>
                  </div>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Ce n&apos;est pas moi ?
                  </Button>
                </Card>
                {data.events.length === 0 ? (
                  <EmptyState title="Aucun événement dans les 14 prochains jours" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.events.map((event) => (
                      <GuestEventCard
                        key={event.id}
                        token={token}
                        event={event}
                        roster={data.roster}
                        teamPlayerId={me.teamPlayerId}
                        via={via}
                        onAnswered={() => setHasAnswered(true)}
                      />
                    ))}
                  </div>
                )}
                {hasAnswered && <GuestInviteNudge token={token} teamPlayerId={me.teamPlayerId} />}
              </>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
