import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import { LegalPageLayout } from './LegalPageLayout';

describe('LegalPageLayout', () => {
  it('has one h1, and the switcher links the three other documents but not the current one', () => {
    renderWithProviders(
      <LegalPageLayout
        title="Politique de confidentialité"
        lastUpdated="1 septembre 2026"
        currentPath="/confidentialite"
      >
        <p>Contenu</p>
      </LegalPageLayout>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Documents légaux', { selector: 'p, span' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Documents légaux' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(within(nav).queryByRole('link', { name: 'Politique de confidentialité' })).toBeNull();
    expect(within(nav).getByText('Politique de confidentialité')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
