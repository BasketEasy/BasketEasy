import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { ConfirmDialog } from '@basketeasy/ui/confirm-dialog';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { MyPlayerGuardian, MyPlayerGuardians } from '@basketeasy/types/guardians';
import { useMyPlayerGuardians, useRemoveMyGuardian } from './useMyPlayerGuardians';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';

function guardianName(guardian: MyPlayerGuardian): string {
  return [guardian.firstName, guardian.lastName].filter(Boolean).join(' ') || 'Parent sans nom';
}

function GuardianRow({
  playerId,
  guardian,
  canRemove,
}: {
  playerId: string;
  guardian: MyPlayerGuardian;
  canRemove: boolean;
}) {
  const { mutate: remove, isPending } = useRemoveMyGuardian(playerId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = guardianName(guardian);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <Text as="span" variant="label">
        {name}
      </Text>
      {canRemove && (
        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setError(null);
          }}
          trigger={
            <Button variant="ghost" size="sm">
              Retirer
            </Button>
          }
          title={`Retirer ${name} ?`}
          description={`${name} ne pourra plus répondre pour vous ni recevoir vos notifications. Le club pourra le lier à nouveau.`}
          confirmLabel="Retirer"
          isPending={isPending}
          error={error}
          onConfirm={() =>
            remove(guardian.userId, {
              onSuccess: () => {
                setOpen(false);
                toast({ variant: 'success', title: `${name} ne vous suit plus` });
              },
              onError: (err) => setError(getClubErrorMessage(err)),
            })
          }
        />
      )}
    </li>
  );
}

function PlayerGuardiansList({ data }: { data: MyPlayerGuardians }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {data.guardians.map((guardian) => (
          <GuardianRow
            key={guardian.userId}
            playerId={data.playerId}
            guardian={guardian}
            // A minor can see who follows them but not change it — the
            // server refuses too; the button just isn't offered.
            canRemove={!data.isMinor}
          />
        ))}
      </ul>
      {data.isMinor && (
        <Text variant="meta">
          Tes parents peuvent répondre pour toi et reçoivent tes notifications.
        </Text>
      )}
    </div>
  );
}

/**
 * « Accès parents »: who can act for the caller as a player. Rendered only
 * when at least one of the caller's players has a guardian.
 */
export function ParentAccessCard({ playerIds }: { playerIds: string[] }) {
  const results = useMyPlayerGuardians(playerIds);
  const failed = results.find((r) => r.isError);
  const loading = results.some((r) => r.isLoading);
  const withGuardians = results
    .map((r) => r.data)
    .filter((d): d is MyPlayerGuardians => !!d && d.guardians.length > 0);

  if (failed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès parents</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryError onRetry={() => void failed.refetch()} isRetrying={failed.isRefetching} />
        </CardContent>
      </Card>
    );
  }
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Loader>Chargement…</Loader>
        </CardContent>
      </Card>
    );
  }
  // Nothing to show for a player nobody follows — the usual adult case.
  if (withGuardians.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès parents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {withGuardians.map((data) => (
          <PlayerGuardiansList key={data.playerId} data={data} />
        ))}
      </CardContent>
    </Card>
  );
}
