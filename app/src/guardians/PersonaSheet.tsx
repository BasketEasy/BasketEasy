import { useId } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { useAccount } from '../auth/useAccount';
import { getInitials } from '../clubs/getInitials';
import { useActingAs } from './useActingAs';
import { SELF_PERSONA_VALUE, pendingLabel } from './personaLabels';

function PersonaRow({
  initials,
  name,
  detail,
  pending,
  selected,
}: {
  initials: string;
  name: string;
  detail: string | null;
  pending: number;
  selected: boolean;
}) {
  const pendingText = pendingLabel(pending);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar size="md">
        <AvatarFallback tone={selected ? 'brand' : 'structure'}>{initials}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        <Text as="span" variant="label">
          {name}
        </Text>
        {detail && (
          <Text as="span" variant="meta" className="truncate">
            {detail}
          </Text>
        )}
      </span>
      {pendingText && (
        <Text as="span" variant="meta" tone="brand">
          {pendingText}
        </Text>
      )}
    </span>
  );
}

/**
 * The persona picker: « Moi » and each child, as radio cards in a bottom
 * sheet (a Dialog placement, not a second modal primitive). Opened from the
 * header chip and from the acting-as banner's « Changer »; mounted once, in
 * ProtectedRoute.
 */
export function PersonaSheet() {
  const { user } = useAccount();
  const { personas, forPlayerId, setForPlayerId, isSwitcherOpen, setSwitcherOpen } = useActingAs();
  const titleId = useId();
  if (!personas) return null;

  const options = [
    ...(personas.self
      ? [
          {
            value: SELF_PERSONA_VALUE,
            render: ({ selected }: { selected: boolean }) => (
              <PersonaRow
                initials={getInitials(user?.firstName ?? 'M', user?.lastName ?? 'oi')}
                name="Moi"
                detail={null}
                pending={personas.self?.pendingCount ?? 0}
                selected={selected}
              />
            ),
          },
        ]
      : []),
    ...personas.children.map((child) => ({
      value: child.playerId,
      render: ({ selected }: { selected: boolean }) => (
        <PersonaRow
          initials={getInitials(child.firstName, child.lastName)}
          name={`${child.firstName} ${child.lastName}`}
          detail={[...child.teams.map((team) => team.teamName), child.clubName].join(' · ')}
          pending={child.pendingCount}
          selected={selected}
        />
      ),
    })),
  ];

  return (
    <Dialog open={isSwitcherOpen} onOpenChange={setSwitcherOpen}>
      <DialogContent variant="sheet" aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Pour qui ?</DialogTitle>
          <DialogDescription>
            Vos réponses, vos équipes et votre semaine suivent la personne choisie.
          </DialogDescription>
        </DialogHeader>
        <RadioCardGroup
          aria-labelledby={titleId}
          tone="choice"
          className="mt-4 flex flex-col gap-2"
          value={forPlayerId ?? SELF_PERSONA_VALUE}
          onChange={(value) => {
            setForPlayerId(value === SELF_PERSONA_VALUE ? null : value);
            setSwitcherOpen(false);
          }}
          options={options}
        />
      </DialogContent>
    </Dialog>
  );
}
