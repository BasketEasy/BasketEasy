import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { PageBackLink, PageBar } from './PageBar';

describe('PageBar', () => {
  it('names the parent in the back link and points at it', () => {
    renderWithProviders(
      <PageBar to="/clubs/c/teams/t?tab=events" state={null} title="U15 Filles" />,
    );
    expect(screen.getByRole('link', { name: 'Retour à U15 Filles' })).toHaveAttribute(
      'href',
      '/clubs/c/teams/t?tab=events',
    );
  });

  it('gives the desktop link the parent name as its label', () => {
    renderWithProviders(
      <PageBackLink to="/clubs/c/teams/t?tab=events" state={null} title="U15 Filles" />,
    );
    expect(screen.getByRole('link', { name: 'U15 Filles' })).toBeInTheDocument();
  });

  it('hides the desktop link below md unless alwaysVisible', () => {
    const { unmount } = renderWithProviders(<PageBackLink to="/x" title="Clubs" />);
    expect(screen.getByRole('link', { name: 'Clubs' })).toHaveClass('hidden');
    unmount();
    renderWithProviders(<PageBackLink to="/x" title="Clubs" alwaysVisible />);
    expect(screen.getByRole('link', { name: 'Clubs' })).not.toHaveClass('hidden');
  });
});
