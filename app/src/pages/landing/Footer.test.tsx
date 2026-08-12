import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Footer } from './Footer';

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Footer />} />
        <Route path="/login" element={<div>Page de connexion</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('renders the BasketEasy wordmark and the required RGPD line', () => {
    renderFooter();
    expect(screen.getByText('BasketEasy')).toBeInTheDocument();
    expect(screen.getByText('Données hébergées en France · RGPD')).toBeInTheDocument();
  });

  it('renders Contact/Mentions légales/Politique de confidentialité as plain text, not links', () => {
    renderFooter();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('navigates to /login when "Connexion club" is clicked', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: 'Connexion club' }));
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });
});
