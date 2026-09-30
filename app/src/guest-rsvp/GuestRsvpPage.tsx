import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { ApiError } from '../api/client';
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
  const { teamPlayerId: storedId, choose, reset } = useGuestIdentity(token);
  const [hasAnswered, setHasAnswered] = useState(false);
  const via = useWhatsAppAttribution();

  // A remembered player who has since left the roster is treated as unset.
  const me = data?.roster.find((member) => member.teamPlayerId === storedId) ?? null;

  return (
    <PageContainer size="md">
      <div className="flex flex-col gap-5 py-6">
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
            <div className="flex flex-col gap-0.5">
              <Heading as="h1">{data.teamName}</Heading>
              <Text variant="meta">{data.clubName}</Text>
            </div>
            {!me ? (
              data.roster.length === 0 ? (
                <EmptyState title="Aucun joueur dans cette équipe" />
              ) : (
                <GuestRosterPicker roster={data.roster} onChoose={choose} />
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Text variant="label">{guestMemberName(me)}</Text>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Ce n&apos;est pas moi ?
                  </Button>
                </div>
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
