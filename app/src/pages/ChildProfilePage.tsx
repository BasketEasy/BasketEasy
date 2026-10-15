import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { List, ListItem } from '@basketeasy/ui/list';
import { Loader } from '@basketeasy/ui/loader';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHero } from '@basketeasy/ui/page-hero';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { GuardianName, MyChildProfile } from '@basketeasy/types/guardians';
import { ApiError } from '../api/client';
import { PageBackLink, PageBar } from '../components/PageBar';
import { ChildProfileForm } from '../guardians/ChildProfileForm';
import { useMyChild, useStopFollowingChild } from '../guardians/useMyChild';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

function fullName(name: GuardianName): string {
  return [name.firstName, name.lastName].filter(Boolean).join(' ') || 'Parent sans nom';
}

function initials(name: GuardianName): string {
  return (
    [name.firstName, name.lastName]
      .map((part) => part?.trim().charAt(0).toUpperCase())
      .filter(Boolean)
      .join('') || '?'
  );
}

function consentLine(consent: NonNullable<MyChildProfile['consent']>): string {
  const date = new Date(consent.consentGivenAt).toLocaleDateString('fr-FR');
  return consent.source === 'GUARDIAN_IN_APP'
    ? `Autorisation parentale donnée le ${date} par ${consent.attestedByName}.`
    : `Autorisation parentale enregistrée par le club le ${date} (${consent.attestedByName}).`;
}

/** A parent's page for one child: correct the profile, see who else follows, stop following. */
export function ChildProfilePage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { data: child, isLoading, isError, error, refetch, isRefetching } = useMyChild(playerId);
  const { mutate: stopFollowing, isPending: isStopping } = useStopFollowingChild(playerId);
  const [stopError, setStopError] = useState<string | null>(null);

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageContainer size="md">
        {notFound ? (
          <EmptyState
            title="Enfant introuvable"
            description="Vous ne suivez pas (ou plus) ce joueur."
            action={
              <Button asChild variant="outline">
                <Link to="/account">Mon compte</Link>
              </Button>
            }
          />
        ) : (
          <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
        )}
      </PageContainer>
    );
  }

  if (isLoading || !child) {
    return (
      <PageContainer size="md">
        <Loader>Chargement du profil…</Loader>
      </PageContainer>
    );
  }

  const handleStop = () => {
    setStopError(null);
    stopFollowing(undefined, {
      onSuccess: () => {
        toast({ variant: 'success', title: `Vous ne suivez plus ${child.firstName}` });
        navigate('/account', { replace: true });
      },
      onError: (err) => setStopError(getClubErrorMessage(err)),
    });
  };

  // An adult has no consent to show; a minor always gets a tile. A missing
  // consent is neutral, not accent: a guardian cannot record it from here.
  const consentTile = child.consent ? (
    <FactTile
      icon={<ShieldIcon aria-hidden="true" size="lg" />}
      label="Autorisation parentale"
      detail={consentLine(child.consent)}
    />
  ) : child.isMinor ? (
    <FactTile
      icon={<ShieldIcon aria-hidden="true" size="lg" />}
      label="Aucune autorisation enregistrée"
      detail="Le club l’enregistre."
    />
  ) : undefined;

  return (
    <>
      <PageBar to="/account" title="Mon compte" />
      <PageContainer size="md" top="bar">
        <PageBackLink to="/account" title="Mon compte" />
        <PageHero
          badges={
            child.isMinor && (
              <Badge variant="soft" tone="muted">
                Mineur·e
              </Badge>
            )
          }
          eyebrow="Enfant suivi"
          title={`${child.firstName} ${child.lastName}`}
          meta={child.clubName}
          aside={consentTile}
          stacked
        />

        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2">Profil</SectionHeading>
          <Card>
            <CardContent>
              {child.isMinor ? (
                <ChildProfileForm key={child.playerId} child={child} />
              ) : (
                <Text variant="meta">
                  {child.birthDate
                    ? `${child.firstName} est majeur·e : son profil est géré par le club ou par ${child.firstName} depuis son propre compte.`
                    : `La date de naissance de ${child.firstName} n’est pas renseignée : seul le club peut modifier son profil.`}
                </Text>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2">Équipes</SectionHeading>
          <Card variant="flush">
            {child.teams.length > 0 ? (
              <List>
                {child.teams.map((team) => (
                  <ListItem key={team.teamId} asChild chevron>
                    <Link to={`/clubs/${child.clubId}/teams/${team.teamId}?pour=${child.playerId}`}>
                      {team.teamName}
                    </Link>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Text variant="meta" className="px-3.5 py-3">
                Inscrit·e dans aucune équipe pour le moment.
              </Text>
            )}
          </Card>
          <Text variant="meta">La licence et les équipes sont gérées par le club.</Text>
        </section>

        <section className="flex flex-col gap-3.5">
          <SectionHeading as="h2">Parents</SectionHeading>
          <Card variant="flush">
            {child.coGuardians.length > 0 ? (
              <List>
                {child.coGuardians.map((guardian, index) => (
                  <ListItem
                    key={index}
                    leading={
                      <Avatar size="md">
                        <AvatarFallback>{initials(guardian)}</AvatarFallback>
                      </Avatar>
                    }
                  >
                    {fullName(guardian)}
                  </ListItem>
                ))}
              </List>
            ) : (
              <Text variant="meta" className="px-3.5 py-3">
                Vous êtes le seul parent à suivre {child.firstName}.
              </Text>
            )}
          </Card>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="self-start">
                Ne plus suivre {child.firstName}
              </Button>
            }
            title={`Ne plus suivre ${child.firstName} ?`}
            description={`Vous ne pourrez plus répondre pour ${child.firstName} ni recevoir ses notifications. Le club devra vous envoyer un nouveau lien pour revenir.`}
            confirmLabel="Ne plus suivre"
            onConfirm={handleStop}
            isPending={isStopping}
            error={stopError}
          />
        </section>
      </PageContainer>
    </>
  );
}
