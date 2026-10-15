import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SectionAccordion, SectionAccordionItem } from './SectionAccordion';

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <SectionAccordion value={value} onValueChange={setValue}>
      <SectionAccordionItem
        value="presences"
        id="presences"
        title="Présences"
        summary="8 / 12"
        summaryLabel="8 présents sur 12"
      >
        <p>Liste</p>
      </SectionAccordionItem>
      <SectionAccordionItem value="partage" id="partage" title="Partage" summary="Envoyé">
        <p>Carte</p>
      </SectionAccordionItem>
      <SectionAccordionItem value="notes" title="Notes">
        <p>Texte</p>
      </SectionAccordionItem>
    </SectionAccordion>
  );
}

describe('SectionAccordion', () => {
  it('renders closed items collapsed, with their content unmounted', () => {
    render(<Harness />);
    for (const name of [/Présences/, /Partage/, /Notes/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByText('Liste')).not.toBeInTheDocument();
  });

  it('toggles with Enter and Space, and keeps several open at once', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('button', { name: /Présences/ }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Liste')).toBeInTheDocument();
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByText('Carte')).toBeInTheDocument();
    expect(screen.getByText('Liste')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.queryByText('Carte')).not.toBeInTheDocument();
  });

  it('moves focus between triggers with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [first, second, third] = screen.getAllByRole('button');
    first!.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(second).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('reads the summary label, not the terse visual, in the accessible name', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Présences 8 présents sur 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partage Envoyé' })).toBeInTheDocument();
  });

  it('opens an item the page seeded, keeping its id in the DOM', () => {
    const { container } = render(<Harness initial={['partage']} />);
    expect(screen.getByText('Carte')).toBeInTheDocument();
    expect(container.querySelector('#presences')).not.toBeNull();
  });
});
