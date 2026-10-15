import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RadioCardGroup } from './RadioCardGroup';

const CANDIDATES = ['Camille', 'Inès', 'Malo'] as const;

function Ballot({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <RadioCardGroup
      aria-label="Meilleur joueur"
      value={value}
      onChange={setValue}
      options={CANDIDATES.map((name) => ({ value: name, render: () => name }))}
    />
  );
}

describe('RadioCardGroup', () => {
  it('exposes a radiogroup with one radio per option', () => {
    render(<Ballot />);
    expect(screen.getByRole('radiogroup', { name: 'Meilleur joueur' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('is a single tab stop: only the first option is tabbable when nothing is selected', () => {
    render(<Ballot />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('moves the tab stop to the selected option', () => {
    render(<Ballot initial="Inès" />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(radios[1]).toBeChecked();
  });

  it('selects with an arrow key and carries focus with it', async () => {
    const user = userEvent.setup();
    render(<Ballot />);
    const radios = screen.getAllByRole('radio');
    await user.tab();
    expect(radios[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();

    await user.keyboard('{ArrowUp}');
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toBeChecked();
  });

  it('wraps at both ends and supports Home/End', async () => {
    const user = userEvent.setup();
    render(<Ballot initial="Camille" />);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    await user.keyboard('{ArrowUp}');
    expect(radios[2]).toBeChecked();

    await user.keyboard('{ArrowDown}');
    expect(radios[0]).toBeChecked();

    await user.keyboard('{End}');
    expect(radios[2]).toBeChecked();

    await user.keyboard('{Home}');
    expect(radios[0]).toBeChecked();
  });

  it('still selects on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioCardGroup
        aria-label="Meilleur joueur"
        value={null}
        onChange={onChange}
        options={CANDIDATES.map((name) => ({ value: name, render: () => name }))}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Malo' }));
    expect(onChange).toHaveBeenCalledWith('Malo');
  });

  it('skips disabled options when navigating', async () => {
    const user = userEvent.setup();
    function WithDisabled() {
      const [value, setValue] = useState<string | null>('Camille');
      return (
        <RadioCardGroup
          aria-label="Meilleur joueur"
          value={value}
          onChange={setValue}
          options={[
            { value: 'Camille', render: () => 'Camille' },
            { value: 'Inès', disabled: true, render: () => 'Inès' },
            { value: 'Malo', render: () => 'Malo' },
          ]}
        />
      );
    }
    render(<WithDisabled />);
    screen.getByRole('radio', { name: 'Camille' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Malo' })).toBeChecked();
  });

  it('composes the shared focus ring', () => {
    render(<Ballot />);
    expect(screen.getAllByRole('radio')[0]).toHaveClass('focus-visible:outline-orange');
  });
  it('draws a hidden radio dot per option when asked, filled only on the selected one', () => {
    const { container } = render(
      <RadioCardGroup
        aria-label="Comment venez-vous ?"
        tone="choice"
        indicator
        value="direct"
        onChange={() => {}}
        options={[
          { value: 'rdv', render: () => 'Au RDV' },
          { value: 'direct', render: () => 'Direct' },
        ]}
      />,
    );
    const dots = container.querySelectorAll('[role="radio"] > [aria-hidden="true"]');
    expect(dots).toHaveLength(2);
    expect(dots[0].childElementCount).toBe(0);
    expect(dots[1].childElementCount).toBe(1);
  });
});
