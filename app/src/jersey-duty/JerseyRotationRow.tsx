import { Controller, useForm } from 'react-hook-form';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { ListItem } from '@basketeasy/ui/list';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Switch } from '@basketeasy/ui/switch';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import type { Gender } from '@basketeasy/types/teams';
import type { JerseyRotationRow as JerseyRotationRowData } from '@basketeasy/types/jersey-duty';
import { formatEventDayMonth } from '../clubs/eventDateFormat';
import { getInitials } from '../clubs/getInitials';
import {
  dutyPersonName,
  exemptLabel,
  lastTurnLine,
  turnsAndLastLine,
  turnsLabel,
} from './jerseyDutyCopy';
import { useJerseyExemption } from './useJerseyRotationMutations';

interface ExemptForm {
  exempt: boolean;
}

/**
 * The manager's exemption switch. One field, one click, nothing to confirm:
 * the form submits on change and the write is optimistic (inline, per
 * CLAUDE.md « Modals vs. inline editing »). `values` keeps the field on what
 * the cache says, so a refused write puts the switch back by itself.
 */
function ExemptToggle({
  clubId,
  teamId,
  teamGender,
  row,
  name,
}: {
  clubId: string;
  teamId: string;
  teamGender: Gender;
  row: JerseyRotationRowData;
  name: string;
}) {
  const { setExempt } = useJerseyExemption(clubId, teamId, teamGender);
  const { control, handleSubmit, reset } = useForm<ExemptForm>({
    values: { exempt: row.exempt },
  });
  const submit = handleSubmit(async ({ exempt }) => {
    // A refused write puts the switch back at once: the cache may be restored
    // before React ever rendered the optimistic value, so `values` alone
    // would never see a change to follow.
    if (!(await setExempt(row, exempt))) reset({ exempt: !exempt });
  });

  return (
    <label className="flex items-center gap-2">
      <Text as="span" variant="meta" size="xs">
        {exemptLabel(teamGender)}
      </Text>
      <Controller
        control={control}
        name="exempt"
        render={({ field }) => (
          <Switch
            aria-label={`Exempter ${name}`}
            checked={field.value}
            onCheckedChange={(checked) => {
              field.onChange(checked);
              void submit();
            }}
          />
        )}
      />
    </label>
  );
}

/**
 * One player of the rotation overview — a table row on desktop, a list row on
 * a phone, one component. The reader's view differs in what it ends with: a
 * player or guardian reads the count (and « Exemptée »), a manager gets the
 * exemption switch.
 */
export function JerseyRotationRow({
  clubId,
  teamId,
  teamGender,
  row,
  canManage,
}: {
  clubId: string;
  teamId: string;
  teamGender: Gender;
  row: JerseyRotationRowData;
  canManage: boolean;
}) {
  const layout = useTableLayout();
  const name = dutyPersonName(row);
  const lastDay = row.lastTurnAt ? formatEventDayMonth(row.lastTurnAt) : null;
  const title = row.isMe && !canManage ? `${name} (vous)` : name;
  const avatar = (
    <Avatar size="md">
      <AvatarFallback tone={row.isMe ? 'brand' : 'structure'}>
        {getInitials(row.firstName, row.lastName)}
      </AvatarFallback>
    </Avatar>
  );
  const exemptBadge = row.exempt && (
    <Badge variant="soft" tone="muted">
      {exemptLabel(teamGender)}
    </Badge>
  );
  const toggle = (
    <ExemptToggle clubId={clubId} teamId={teamId} teamGender={teamGender} row={row} name={name} />
  );

  if (layout === 'row') {
    return (
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            {avatar}
            <Text as="span" variant="label">
              {title}
            </Text>
            {!canManage && exemptBadge}
          </div>
        </TableCell>
        <TableCell className="tabular">{turnsLabel(row.turnsThisSeason)}</TableCell>
        <TableCell className="tabular">{lastDay ?? '—'}</TableCell>
        {canManage && <TableCell>{toggle}</TableCell>}
      </TableRow>
    );
  }

  return (
    <ListItem
      leading={avatar}
      meta={canManage ? turnsAndLastLine(row.turnsThisSeason, lastDay) : lastTurnLine(lastDay)}
      trailing={
        canManage ? (
          toggle
        ) : (
          <>
            {exemptBadge}
            <Text as="span" variant="display" size="2xl" className="tabular min-w-6 text-right">
              {row.turnsThisSeason}
            </Text>
          </>
        )
      }
    >
      {title}
    </ListItem>
  );
}
