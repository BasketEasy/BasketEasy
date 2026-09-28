import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { Heading } from '@basketeasy/ui/heading';
import { Loader } from '@basketeasy/ui/loader';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { toast } from '@basketeasy/ui/toast-store';
import type { GuardianName, MyChildProfile } from '@basketeasy/types/guardians';
import { ApiError } from '../api/client';
import { ChildProfileForm } from '../guardians/ChildProfileForm';
import { useMyChild, useStopFollowingChild } from '../guardians/useMyChild';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

function fullName(name: GuardianName): string {
  return [name.firstName, name.lastName].filter(Boolean).join(' ') || 'Parent sans nom';
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
        <Card>
          <CardHeader>
            <CardTitle>{notFound ? 'Enfant introuvable' : 'Profil indisponible'}</CardTitle>
          </CardHeader>
          <CardContent>
            {notFound ? (
              <Text variant="meta">
                Vous ne suivez pas (ou plus) ce joueur.{' '}
                <TextLink asChild>
                  <Link to="/account">Retour à mon compte</Link>
                </TextLink>
              </Text>
            ) : (
              <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
            )}
          </CardContent>
        </Card>
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

  return (
    <PageContainer size="md">
      <Heading as="h1">
        {child.firstName} {child.lastName}
      </Heading>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <ChildProfileForm key={child.playerId} child={child} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licence et équipes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <Text variant="label">{child.clubName}</Text>
          <Text variant="meta">
            {child.teams.length > 0
              ? child.teams.map((team) => team.teamName).join(' · ')
              : 'Inscrit·e dans aucune équipe pour le moment.'}
          </Text>
          <Text variant="meta">Le numéro de licence et les équipes sont gérés par le club.</Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Text variant="meta">
            {child.coGuardians.length > 0
              ? `Suivi aussi par ${child.coGuardians.map(fullName).join(', ')}.`
              : `Vous êtes le seul parent à suivre ${child.firstName}.`}
          </Text>
          {child.consent ? (
            <Text variant="meta">{consentLine(child.consent)}</Text>
          ) : (
            child.isMinor && (
              <Text variant="meta">Aucune autorisation parentale enregistrée pour le moment.</Text>
            )
          )}
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
        </CardContent>
      </Card>
    </PageContainer>
  );
}
