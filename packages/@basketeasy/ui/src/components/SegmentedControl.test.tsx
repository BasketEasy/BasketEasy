import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'agenda', label: 'Agenda' },
  { value: 'table', label: 'Liste' },
  { value: 'map', label: 'Carte' },
];

function Controlled({ initial = 'agenda' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      ariaLabel="Affichage des événements"
      value={value}
      onChange={setValue}
      options={OPTIONS}
    />
  );
}

describe('SegmentedControl', () => {
  it('exposes a named group of pressable options', () => {
    render(<Controlled />);

    expect(screen.getByRole('group', { name: 'Affichage des événements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes the pressed option on click', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('button', { name: 'Liste' }));

    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is a single tab stop: only the pressed option is tabbable', () => {
    render(<Controlled initial="table" />);

    expect(screen.getAllByRole('button').map((b) => b.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ]);
  });

  it('falls back to the first option as the tab stop when the value matches nothing', () => {
    render(<Controlled initial="unknown" />);

    expect(screen.getAllByRole('button').map((b) => b.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });

  it('moves the selection with the arrow keys, carrying focus', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const options = screen.getAllByRole('button');

    await user.tab();
    expect(options[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(options[1]).toHaveFocus();
    expect(options[1]).toHaveAttribute('aria-pressed', 'true');

    // Wraps at the ends, like the radiogroup pattern.
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(options[2]).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports Home and End', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="table" />);
    const options = screen.getAllByRole('button');
    options[1].focus();

    await user.keyboard('{End}');
    expect(options[2]).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Home}');
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports every activation, including one on the option already pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="Période" value="agenda" onChange={onChange} options={OPTIONS} />,
    );

    // A caller holding a two-state toggle rather than a value setter has to
    // compare against its own state — this primitive does not swallow it.
    await user.click(screen.getByRole('button', { name: 'Agenda' }));
    expect(onChange).toHaveBeenCalledWith('agenda');
  });
});
