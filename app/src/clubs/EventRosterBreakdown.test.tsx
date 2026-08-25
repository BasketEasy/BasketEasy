import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventRosterBreakdown } from './EventRosterBreakdown';
import { meterWidthClass } from './meterWidthClass';

describe('EventRosterBreakdown', () => {
  it('shows a filled dot and a text label for every roster entry', () => {
    render(
      <EventRosterBreakdown
        isOpen
        onToggle={() => {}}
        openLabel="Masquer les réponses"
        closedLabel="Voir les réponses"
        summary="8/12 confirmés"
        entries={[
          {
            id: '1',
            firstName: 'Léa',
            lastName: 'Moreau',
            role: 'Joueur',
            statusLabel: 'Présente',
            statusClassName: 'text-success',
            filled: true,
          },
        ]}
      />,
    );
    expect(screen.getByText('Présente')).toBeInTheDocument();
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument();
  });

  it('shows the closed label and toggles on click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <EventRosterBreakdown
        isOpen={false}
        onToggle={onToggle}
        openLabel="Masquer les réponses"
        closedLabel="Voir les réponses"
        entries={[]}
      />,
    );
    const button = screen.getByRole('button', { name: /voir les réponses/i });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('meterWidthClass', () => {
  it('rounds to the nearest quarter using the fixed class set', () => {
    expect(meterWidthClass(0, 12)).toBe('w-0');
    expect(meterWidthClass(1, 12)).toBe('w-0');
    expect(meterWidthClass(2, 12)).toBe('w-1/4');
    expect(meterWidthClass(3, 12)).toBe('w-1/4');
    expect(meterWidthClass(6, 12)).toBe('w-1/2');
    expect(meterWidthClass(8, 12)).toBe('w-3/4');
    expect(meterWidthClass(12, 12)).toBe('w-full');
  });

  it('returns w-0 for a zero or negative max', () => {
    expect(meterWidthClass(0, 0)).toBe('w-0');
    expect(meterWidthClass(5, 0)).toBe('w-0');
  });
});
