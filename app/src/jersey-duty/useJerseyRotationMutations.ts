import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@basketeasy/ui/toast-store';
import type { Gender, Team } from '@basketeasy/types/teams';
import type { JerseyRotationOverview, JerseyRotationRow } from '@basketeasy/types/jersey-duty';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  jerseyRotationQueryKeyPrefix,
  teamEventsQueryKeyPrefix,
  teamQueryKey,
} from '../clubs/queryKeys';
import { useTeamPlayerUpdate } from '../clubs/useTeamPlayerUpdate';
import { useTeamUpdate } from '../clubs/useTeamUpdate';
import {
  ROTATION_OFF_TOAST,
  ROTATION_ON_TOAST,
  dutyPersonName,
  exemptionToast,
} from './jerseyDutyCopy';

/**
 * Both settings of the team page are inline, one-field and reversible: the
 * cached overview is flipped at once and put back if the write is refused.
 * What shows the same fact elsewhere (the next match's suggestion, every
 * match's duty or plain slot) is refreshed once the server has answered.
 */
function useOptimisticOverview(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  const prefix = jerseyRotationQueryKeyPrefix(clubId, teamId);

  return {
    /** Applies `change` to every cached overview of the team; returns the undo. */
    apply(change: (overview: JerseyRotationOverview) => JerseyRotationOverview) {
      const snapshot = queryClient.getQueriesData<JerseyRotationOverview>({ queryKey: prefix });
      queryClient.setQueriesData<JerseyRotationOverview>({ queryKey: prefix }, (old) =>
        old ? change(old) : old,
      );
      return () => {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      };
    },
    refresh() {
      void queryClient.invalidateQueries({ queryKey: prefix });
      void queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(clubId, teamId) });
    },
  };
}

/** The manager's « Exempté » switch on one row. */
export function useJerseyExemption(clubId: string, teamId: string, teamGender: Gender) {
  const overview = useOptimisticOverview(clubId, teamId);
  const update = useTeamPlayerUpdate(clubId, teamId);

  return {
    isPending: update.isPending,
    /** Resolves `false` when the write was refused (the cache is already put back). */
    async setExempt(row: JerseyRotationRow, exempt: boolean): Promise<boolean> {
      const undo = overview.apply((current) => ({
        ...current,
        rows: current.rows.map((r) => (r.playerId === row.playerId ? { ...r, exempt } : r)),
      }));
      try {
        await update.mutateAsync({ playerId: row.playerId, jerseyDutyExempt: exempt });
        toast({
          variant: 'success',
          description: exemptionToast(dutyPersonName(row), exempt, teamGender),
        });
        return true;
      } catch (err) {
        undo();
        toast({ variant: 'destructive', description: getClubErrorMessage(err) });
        return false;
      } finally {
        overview.refresh();
      }
    },
  };
}

/** The manager's « Rotation activée » switch. */
export function useJerseyRotationSwitch(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  const overview = useOptimisticOverview(clubId, teamId);
  const update = useTeamUpdate(clubId, teamId);

  return {
    isPending: update.isPending,
    /** Resolves `false` when the write was refused (the caches are already put back). */
    async setEnabled(enabled: boolean): Promise<boolean> {
      const undoOverview = overview.apply((current) => ({ ...current, enabled }));
      const previousTeam = queryClient.getQueryData<Team>(teamQueryKey(clubId, teamId));
      if (previousTeam) {
        queryClient.setQueryData<Team>(teamQueryKey(clubId, teamId), {
          ...previousTeam,
          jerseyRotationEnabled: enabled,
        });
      }
      try {
        await update.mutateAsync({ jerseyRotationEnabled: enabled });
        toast({
          variant: 'success',
          description: enabled ? ROTATION_ON_TOAST : ROTATION_OFF_TOAST,
        });
        return true;
      } catch (err) {
        undoOverview();
        if (previousTeam) queryClient.setQueryData(teamQueryKey(clubId, teamId), previousTeam);
        toast({ variant: 'destructive', description: getClubErrorMessage(err) });
        return false;
      } finally {
        overview.refresh();
      }
    },
  };
}
