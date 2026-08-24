import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresenceSandbox } from './PresenceSandbox';
import { SANDBOX_ROSTER } from './data';

describe('PresenceSandbox', () => {
  it('renders the initial present count from the sample roster', () => {
    render(<PresenceSandbox />);
    const initialPresent = SANDBOX_ROSTER.filter((p) => p.status === 'present').length;
    expect(
      screen.getByText(`${initialPresent} / ${SANDBOX_ROSTER.length} PRÉSENTS`),
    ).toBeInTheDocument();
  });

  it('toggles a player between present and absent, updating the count', async () => {
    const user = userEvent.setup();
    render(<PresenceSandbox />);

    const absentPlayer = SANDBOX_ROSTER.find((p) => p.status === 'absent');
    if (!absentPlayer) {
      throw new Error('fixture must include at least one absent player');
    }

    const initialPresent = SANDBOX_ROSTER.filter((p) => p.status === 'present').length;
    const row = screen.getByText(absentPlayer.name).closest('div')!.parentElement!;
    const toggleButton = row.querySelector('button')!;

    expect(toggleButton).toHaveTextContent('✕ ABSENT');
    await user.click(toggleButton);

    expect(toggleButton).toHaveTextContent('✓ PRÉSENT');
    expect(
      screen.getByText(`${initialPresent + 1} / ${SANDBOX_ROSTER.length} PRÉSENTS`),
    ).toBeInTheDocument();
  });

  it('has a #demo anchor for the hero CTA to scroll to', () => {
    const { container } = render(<PresenceSandbox />);
    expect(container.querySelector('#demo')).not.toBeNull();
  });
});
