import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@basketeasy/ui/toast-store';
import type { JerseyDutyDetail, ProposeJerseySwapRequest } from '@basketeasy/types/jersey-duty';
import { ApiError, apiClient } from '../api/client';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  invalidateEventDetails,
  invalidateEventLists,
  invalidateJerseyRotation,
  invalidateOtherPersonas,
} from '../clubs/eventCache';
import { jerseyDutyQueryKey } from '../clubs/queryKeys';
import { actingAsQuery, useTeamActingAs } from '../guardians/useActingAs';
import { dutyPersonName } from './jerseyDutyCopy';

const SWAP_UNAVAILABLE = 'L’échange n’est plus disponible.';

interface DutyAction<TVariables> {
  /** The request, given the `?forPlayerId=` suffix a player-side route takes (empty for a manager's). */
  request: (base: string, actingAs: string, variables: TVariables) => Promise<JerseyDutyDetail>;
  /** Player-side routes act for the persona; a manager's never do. */
  actsForPersona: boolean;
  /** The success toast. */
  success: (detail: JerseyDutyDetail, variables: TVariables) => string;
  /** The swap dialog shows its refusal inline, so its hook leaves the error to the caller. */
  toastError?: boolean;
}

/**
 * Every jersey duty write answers with the whole `JerseyDutyDetail`, so each
 * one writes it straight into the duty's cache and invalidates what shows the
 * same fact elsewhere: the event lists (the agenda chip), the event's own
 * detail (`TeamEvent.jerseyDuty`) and the rotation overview, but not the duty
 * it has just written. The outcome is a toast, not an inline message: the
 * control that triggered it has usually gone.
 */
function useDutyAction<TVariables = void>(
  clubId: string,
  teamId: string,
  eventId: string,
  action: DutyAction<TVariables>,
) {
  const queryClient = useQueryClient();
  const actingFor = useTeamActingAs(teamId);
  const base = `/clubs/${clubId}/teams/${teamId}/events/${eventId}/jersey-duty`;
  const dutyKey = jerseyDutyQueryKey(clubId, teamId, eventId, actingFor);

  return useMutation({
    mutationFn: (variables: TVariables) =>
      action.request(base, action.actsForPersona ? actingAsQuery(actingFor) : '', variables),
    onSuccess: (detail, variables) => {
      queryClient.setQueryData(dutyKey, detail);
      invalidateOtherPersonas(queryClient, { clubId, teamId, eventId }, 'jersey-duty', actingFor);
      invalidateEventLists(queryClient, { clubId, teamId });
      invalidateEventDetails(queryClient, { clubId, teamId, eventId });
      invalidateJerseyRotation(queryClient, { clubId, teamId });
      toast({ variant: 'success', description: action.success(detail, variables) });
    },
    onError: (err) => {
      // A 409 is a race (someone answered first): what is on screen is stale.
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: dutyKey });
      }
      if (action.toastError !== false) {
        toast({
          variant: 'destructive',
          description: getClubErrorMessage(err, { 409: SWAP_UNAVAILABLE }),
        });
      }
    },
  });
}

export function useJerseyDutyAccept(clubId: string, teamId: string, eventId: string) {
  return useDutyAction(clubId, teamId, eventId, {
    actsForPersona: true,
    request: (base, query) => apiClient.post<JerseyDutyDetail>(`${base}/accept${query}`),
    success: () => 'C’est noté, merci !',
  });
}

export function useJerseyDutyDecline(clubId: string, teamId: string, eventId: string) {
  return useDutyAction(clubId, teamId, eventId, {
    actsForPersona: true,
    request: (base, query) => apiClient.post<JerseyDutyDetail>(`${base}/decline${query}`),
    success: () => 'C’est noté, la suggestion passe à quelqu’un d’autre.',
  });
}

export function useJerseyDutySwap(clubId: string, teamId: string, eventId: string) {
  return useDutyAction<ProposeJerseySwapRequest & { targetName: string }>(clubId, teamId, eventId, {
    actsForPersona: true,
    toastError: false,
    request: (base, query, { teamPlayerId }) =>
      apiClient.post<JerseyDutyDetail>(`${base}/swap${query}`, { teamPlayerId }),
    success: (_detail, { targetName }) => `Proposition envoyée à ${targetName}`,
  });
}

export function useJerseyDutyCancelSwap(clubId: string, teamId: string, eventId: string) {
  return useDutyAction(clubId, teamId, eventId, {
    actsForPersona: true,
    request: (base, query) => apiClient.delete<JerseyDutyDetail>(`${base}/swap${query}`),
    success: () => 'Proposition annulée.',
  });
}

export function useJerseyDutyAcceptSwap(clubId: string, teamId: string, eventId: string) {
  return useDutyAction(clubId, teamId, eventId, {
    actsForPersona: true,
    request: (base, query) => apiClient.post<JerseyDutyDetail>(`${base}/swap/accept${query}`),
    success: () => 'C’est noté, merci !',
  });
}

export function useJerseyDutyRefuseSwap(clubId: string, teamId: string, eventId: string) {
  return useDutyAction(clubId, teamId, eventId, {
    actsForPersona: true,
    request: (base, query) => apiClient.post<JerseyDutyDetail>(`${base}/swap/refuse${query}`),
    success: () => 'Échange refusé.',
  });
}

/** A manager's assign / change; `null` clears the duty. */
export function useJerseyDutyAssign(clubId: string, teamId: string, eventId: string) {
  return useDutyAction<{ teamPlayerId: string | null }>(clubId, teamId, eventId, {
    actsForPersona: false,
    request: (base, _query, { teamPlayerId }) =>
      apiClient.put<JerseyDutyDetail>(base, { teamPlayerId }),
    success: (detail) =>
      detail.holder
        ? `${dutyPersonName(detail.holder)} lave les maillots après ce match.`
        : 'Lavage retiré.',
  });
}

/** « Marquer fait » (`true`) and « Rouvrir » (`false`). */
export function useJerseyDutySetDone(clubId: string, teamId: string, eventId: string) {
  return useDutyAction<boolean>(clubId, teamId, eventId, {
    actsForPersona: false,
    request: (base, _query, done) =>
      done
        ? apiClient.post<JerseyDutyDetail>(`${base}/done`)
        : apiClient.delete<JerseyDutyDetail>(`${base}/done`),
    success: (_detail, done) => (done ? 'Marqué comme fait.' : 'Remis en cours.'),
  });
}

/** « Annuler ce tour » (`true`) and « Rétablir ce tour » (`false`). */
export function useJerseyDutySetVoided(clubId: string, teamId: string, eventId: string) {
  return useDutyAction<boolean>(clubId, teamId, eventId, {
    actsForPersona: false,
    request: (base, _query, voided) =>
      voided
        ? apiClient.post<JerseyDutyDetail>(`${base}/void`)
        : apiClient.delete<JerseyDutyDetail>(`${base}/void`),
    success: (_detail, voided) => (voided ? 'Tour annulé.' : 'Tour rétabli.'),
  });
}
